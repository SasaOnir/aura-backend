import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { needsRehash } from '../common/argon2-params';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions.service';
import { RegisterDto, LoginDto } from './dto';
import { MailService, escapeHtml } from '../mail/mail.service';
import { EmailTokenService } from './email-token.service';
import { MfaService } from './mfa.service';
import { checkPasswordPolicy } from '../common/password-policy';

export const JWT_ALG = 'HS256' as const;
export const JWT_ISSUER = 'aura';
export const JWT_AUDIENCE = 'aura-api';

// argon2id (OWASP: m=19MiB, t=2, p=1 come minimo)
const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 } as const;

const INVALID_CREDENTIALS = 'Credenziali non valide.';
const INVALID_REFRESH = 'Sessione non valida o scaduta.';

// Accetta sia il client Prisma sia il client di transazione.
type RefreshTokenWriter = { refreshToken: { create: (args: any) => Promise<{ id: string; expiresAt: Date }> } };

export type TokenType = 'access' | 'refresh' | 'mfa' | 'mfa_enroll';

export type LoginResult =
  | { user: any; accessToken: string; accessTokenExpiresIn: number; refreshToken: string; refreshTokenExpiresAt: string }
  | { mfaRequired: true; mfaToken: string }
  | { mfaEnrollmentRequired: true; enrollToken: string };

export interface JwtPayload {
  sub: string;
  email: string;
  type: TokenType;
  jti?: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('AuthService');
  // Hash fittizio: serve a spendere lo stesso tempo di CPU anche quando l'email
  // non esiste, così il tempo di risposta non rivela quali account esistono.
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
    private readonly mail: MailService,
    private readonly emailTokens: EmailTokenService,
    private readonly mfa: MfaService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await hash(randomBytes(16).toString('hex'), ARGON_OPTS);
  }

  // ─── Registrazione ─────────────────────────────────────────────────────
  /**
   * Risposta IDENTICA sia per email nuova sia per email già registrata (anti-enumeration):
   * l'esito reale arriva solo via email. L'account nasce 'pending_verification' e non può
   * accedere finché l'email non è verificata. L'invio email è asincrono, così non
   * introduce differenze di tempo tra i due casi.
   */
  async register(dto: RegisterDto, ip?: string, ua?: string) {
    const email = dto.email.trim().toLowerCase();

    const policyError = checkPasswordPolicy(dto.password, { email, displayName: dto.displayName });
    if (policyError) throw new BadRequestException(policyError);

    const generic = { ok: true, message: 'Se l\'indirizzo è valido, riceverai un\'email con le istruzioni per completare la registrazione.' };

    // Costo CPU identico nei due rami
    const passwordHash = await hash(dto.password, ARGON_OPTS);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.status === 'pending_verification' && existing.passwordHash) {
        await this.sendVerificationEmail(existing.id, existing.email, existing.displayName);
      } else {
        this.mail.sendSafe({
          to: existing.email,
          subject: 'Aura — tentativo di registrazione con la tua email',
          text: 'Qualcuno ha provato a registrarsi su Aura con questo indirizzo, ma esiste già un account.\n\nSe sei stato tu, accedi oppure usa "Password dimenticata". Se non sei stato tu, puoi ignorare questo messaggio.',
        });
      }
      return generic;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, passwordHash, displayName: dto.displayName.trim(), accountType: dto.accountType, status: 'pending_verification', emailVerified: false },
      });
      await tx.userProfile.create({ data: { userId: u.id, language: 'it' } });
      await tx.auditLog.create({
        data: { actorId: u.id, action: 'user.register', resourceType: 'user', resourceId: u.id, ip, userAgent: ua, result: 'success' },
      });
      return u;
    });

    await this.sendVerificationEmail(user.id, user.email, user.displayName);
    return generic;
  }

  private appUrl(path: string): string {
    return `${(this.config.get<string>('APP_ORIGIN') || 'http://localhost:3000').replace(/\/$/, '')}${path}`;
  }

  /** Il token sta nel FRAGMENT (#): non viene inviato al server, né finisce nei log o nel Referer. */
  private async sendVerificationEmail(userId: string, to: string, name: string) {
    const token = await this.emailTokens.create(userId, 'verify_email');
    const link = this.appUrl(`/verify-email#token=${token}`);
    this.mail.sendSafe({
      to,
      subject: 'Aura — conferma la tua email',
      text: `Ciao ${name},\n\nconferma la tua email per attivare l'account Aura (il link vale 24 ore):\n${link}\n\nSe non hai creato tu l'account, ignora questo messaggio.`,
      html: `<p>Ciao ${escapeHtml(name)},</p><p>conferma la tua email per attivare l'account Aura (il link vale 24 ore):</p><p><a href="${escapeHtml(link)}">Conferma email</a></p><p>Se non hai creato tu l'account, ignora questo messaggio.</p>`,
    });
  }

  async verifyEmail(token: string) {
    const t = await this.emailTokens.consume(token, ['verify_email']);
    if (!t) throw new BadRequestException('Link non valido o scaduto.');
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: t.userId } });
      if (!u) return;
      await tx.user.update({
        where: { id: u.id },
        data: { emailVerified: true, ...(u.status === 'pending_verification' && u.passwordHash ? { status: 'active' } : {}) },
      });
      await tx.auditLog.create({ data: { actorId: u.id, action: 'user.verify_email', resourceType: 'user', resourceId: u.id, result: 'success' } });
    });
    return { ok: true };
  }

  /** Risposta sempre identica: non rivela se l'indirizzo esiste. */
  async resendVerification(emailRaw: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
    if (user && user.status === 'pending_verification' && user.passwordHash) {
      await this.sendVerificationEmail(user.id, user.email, user.displayName);
    }
    return { ok: true, message: 'Se l\'indirizzo è in attesa di verifica, riceverai una nuova email.' };
  }

  // ─── Password dimenticata / impostazione password (reset e invito staff) ─
  async forgotPassword(emailRaw: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
    if (user && (user.status === 'active' || user.status === 'pending_verification')) {
      const token = await this.emailTokens.create(user.id, 'password_reset');
      const link = this.appUrl(`/set-password#token=${token}`);
      this.mail.sendSafe({
        to: user.email,
        subject: 'Aura — reimposta la password',
        text: `Hai richiesto di reimpostare la password di Aura (il link vale 1 ora):\n${link}\n\nSe non sei stato tu, ignora questo messaggio: la tua password non cambia.`,
        html: `<p>Hai richiesto di reimpostare la password di Aura (il link vale 1 ora):</p><p><a href="${escapeHtml(link)}">Reimposta password</a></p><p>Se non sei stato tu, ignora questo messaggio.</p>`,
      });
    }
    return { ok: true, message: 'Se l\'indirizzo è registrato, riceverai un\'email con le istruzioni.' };
  }

  /**
   * Imposta la password con un token (reset o primo accesso dello staff invitato).
   * Non effettua il login e NON tocca l'MFA: dopo il reset l'accesso richiede comunque il secondo fattore.
   * La policy si controlla PRIMA di consumare il token, così una password debole non brucia il link.
   */
  async setPassword(token: string, password: string, ip?: string, ua?: string) {
    const peek = await this.emailTokens.peek(token, ['password_reset', 'staff_invite']);
    if (!peek) throw new BadRequestException('Link non valido o scaduto.');
    const user = await this.prisma.user.findUnique({ where: { id: peek.userId } });
    if (!user) throw new BadRequestException('Link non valido o scaduto.');

    const policyError = checkPasswordPolicy(password, { email: user.email, displayName: user.displayName });
    if (policyError) throw new BadRequestException(policyError);

    const t = await this.emailTokens.consume(token, ['password_reset', 'staff_invite']);
    if (!t) throw new BadRequestException('Link non valido o scaduto.');

    const passwordHash = await hash(password, ARGON_OPTS);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        // Aver ricevuto l'email prova il possesso dell'indirizzo: verifica e attiva
        data: { passwordHash, emailVerified: true, ...(user.status === 'pending_verification' ? { status: 'active' } : {}) },
      });
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }); // chiude tutte le sessioni
      await tx.auditLog.create({
        data: { actorId: user.id, action: t.purpose === 'staff_invite' ? 'staff.accept_invite' : 'auth.password_reset', resourceType: 'user', resourceId: user.id, ip, userAgent: ua, result: 'success' },
      });
    });
    return { ok: true };
  }

  // ─── Login ─────────────────────────────────────────────────────────────
  async login(dto: LoginDto, ip?: string, ua?: string): Promise<LoginResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Verifica SEMPRE un hash (reale o fittizio): niente differenze di timing.
    const ok = await verify(user?.passwordHash || this.dummyHash, dto.password).catch(() => false);

    if (!user || !user.passwordHash || !ok) {
      await this.auditLoginFailure(user?.id, ip, ua);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // Password corretta ma email non verificata: qui si può dire la verità (chi arriva qui conosce la password).
    if (user.status === 'pending_verification') {
      throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Verifica la tua email per accedere.' });
    }
    if (user.status !== 'active') {
      await this.auditLoginFailure(user.id, ip, ua);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (needsRehash(user.passwordHash, ARGON_OPTS)) {
      const newHash = await hash(dto.password, ARGON_OPTS);
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    }

    // Secondo fattore: nessun access/refresh token finché non è superato.
    if (user.mfaEnabled) {
      return { mfaRequired: true, mfaToken: await this.signPurpose(user, 'mfa', 300) };
    }
    const admin = await this.prisma.adminAccount.findUnique({ where: { userId: user.id } });
    if (admin && admin.status === 'active' && admin.mfaRequired) {
      // Staff senza MFA configurata: può SOLO configurarla (token a scopo limitato), niente accesso al pannello.
      return { mfaEnrollmentRequired: true, enrollToken: await this.signPurpose(user, 'mfa_enroll', 900) };
    }
    return this.completeLogin(user, ip, ua, 'pwd');
  }

  private async completeLogin(user: any, ip?: string, ua?: string, method = 'pwd') {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'auth.login', resourceType: 'user', resourceId: user.id, ip, userAgent: ua, result: 'success', reason: method },
      });
    });
    const { refreshId, ...tokens } = await this.issueTokens(user, ip, ua);
    return { user: this.publicUser(user), ...tokens };
  }

  // ─── MFA ───────────────────────────────────────────────────────────────
  async mfaVerify(mfaToken: string, input: { code?: string; recoveryCode?: string }, ip?: string, ua?: string) {
    if (!input.code && !input.recoveryCode) throw new BadRequestException('Inserisci il codice.');
    const p = await this.verifyPurpose(mfaToken, ['mfa']);
    const user = await this.prisma.user.findUnique({ where: { id: p.sub } });
    if (!user || user.status !== 'active') throw new UnauthorizedException(INVALID_REFRESH);
    const ok = await this.mfa.verifyForLogin(user.id, input);
    if (!ok) {
      await this.auditLoginFailure(user.id, ip, ua);
      throw new UnauthorizedException('Codice non valido.');
    }
    return this.completeLogin(user, ip, ua, input.recoveryCode ? 'mfa_recovery' : 'mfa_totp');
  }

  /** Identifica chi chiama gli endpoint MFA: access token normale OPPURE token di enrollment dello staff. */
  async userFromBearer(authorization: string | undefined, types: TokenType[]): Promise<{ id: string; type: TokenType }> {
    const m = /^Bearer (.+)$/.exec(authorization || '');
    if (!m) throw new UnauthorizedException();
    const p = await this.verifyPurpose(m[1], types);
    const u = await this.prisma.user.findUnique({ where: { id: p.sub }, select: { status: true } });
    if (!u || u.status !== 'active') throw new UnauthorizedException();
    return { id: p.sub, type: p.type };
  }

  mfaSetup(userId: string) { return this.mfa.setup(userId); }

  /** Se la chiamata arriva con il token di enrollment, la conferma completa anche il login (staff). */
  async mfaEnable(caller: { id: string; type: TokenType }, code: string, ip?: string, ua?: string) {
    const { recoveryCodes } = await this.mfa.enable(caller.id, code);
    await this.prisma.auditLog.create({ data: { actorId: caller.id, action: 'auth.mfa_enabled', resourceType: 'user', resourceId: caller.id, ip, userAgent: ua, result: 'success' } });
    if (caller.type !== 'mfa_enroll') return { recoveryCodes };
    const user = await this.prisma.user.findUnique({ where: { id: caller.id } });
    const session = await this.completeLogin(user, ip, ua, 'mfa_enroll');
    return { recoveryCodes, ...session };
  }

  async mfaDisable(userId: string, password: string, code: string) {
    await this.mfa.disable(userId, password, code);
    await this.prisma.auditLog.create({ data: { actorId: userId, action: 'auth.mfa_disabled', resourceType: 'user', resourceId: userId, result: 'success' } });
    return { ok: true };
  }

  private signPurpose(user: { id: string; email: string }, type: 'mfa' | 'mfa_enroll', ttl: number) {
    return this.jwt.signAsync({ sub: user.id, email: user.email, type } satisfies JwtPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: ttl, algorithm: JWT_ALG, issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
    });
  }

  private async verifyPurpose(token: string, types: TokenType[]): Promise<JwtPayload> {
    try {
      const p = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), algorithms: [JWT_ALG], issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
      });
      if (!types.includes(p.type)) throw new Error('tipo token');
      return p;
    } catch {
      throw new UnauthorizedException(INVALID_REFRESH);
    }
  }

  private async auditLoginFailure(userId: string | undefined, ip?: string, ua?: string) {
    try {
      await this.prisma.auditLog.create({
        data: { actorId: userId, action: 'auth.login', resourceType: 'user', resourceId: userId, ip, userAgent: ua, result: 'failure' },
      });
    } catch (e) {
      this.logger.error(`Audit login failure non scritto: ${(e as Error).message}`);
    }
  }

  // ─── Refresh con rotazione atomica + rilevamento del riuso ─────────────
  async refresh(refreshToken: string, ip?: string, ua?: string) {
    const tokenHash = this.hashToken(refreshToken);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const record = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!record || record.expiresAt < new Date()) return { kind: 'invalid' as const };

      // "Claim" atomico: solo UNA richiesta concorrente può revocare il token.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (claimed.count === 0) {
        // Token già usato/revocato che qualcuno ripresenta = probabile furto.
        // Si revoca l'intera famiglia di sessioni dell'utente.
        await tx.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.auditLog.create({
          data: { actorId: record.userId, action: 'auth.refresh_reuse_detected', resourceType: 'user', resourceId: record.userId, ip, userAgent: ua, result: 'denied' },
        });
        return { kind: 'reuse' as const };
      }

      const user = await tx.user.findUnique({ where: { id: record.userId } });
      if (!user || user.status !== 'active') return { kind: 'invalid' as const };

      const tokens = await this.issueTokens(user, ip, ua, tx);
      await tx.refreshToken.update({ where: { id: record.id }, data: { replacedById: tokens.refreshId } });
      return { kind: 'ok' as const, user, tokens };
    });

    // Il throw avviene FUORI dalla transazione, altrimenti la revoca della famiglia verrebbe annullata.
    if (outcome.kind !== 'ok') throw new UnauthorizedException(INVALID_REFRESH);
    const { refreshId, ...pub } = outcome.tokens;
    return { user: this.publicUser(outcome.user), ...pub };
  }

  // ─── Logout ────────────────────────────────────────────────────────────
  /**
   * Revoca il refresh token presentato. Funziona anche con access token scaduto
   * (il refresh token è già la credenziale): altrimenti, dopo 15 minuti, "Esci"
   * lascerebbe la sessione valida sul server.
   */
  async logout(refreshToken: string) {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(refreshToken) } });
    if (record && !record.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { id: record.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.prisma.auditLog.create({
        data: { actorId: record.userId, action: 'auth.logout', resourceType: 'user', resourceId: record.userId, result: 'success' },
      });
    }
    return { ok: true }; // stessa risposta anche se il token non esiste: nessuna informazione
  }

  /** Chiude TUTTE le sessioni dell'utente autenticato (es. "esci da tutti i dispositivi"). */
  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { actorId: userId, action: 'auth.logout_all', resourceType: 'user', resourceId: userId, result: 'success' },
    });
    return { ok: true };
  }

  /** Profilo + permessi effettivi dell'utente autenticato (per la UI; l'enforcement resta server-side). */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') throw new UnauthorizedException();
    const perms = await this.permissions.getPermissions(userId);
    return { user: this.publicUser(user), permissions: [...perms].sort() };
  }

  // ─── Emissione token ───────────────────────────────────────────────────
  private async issueTokens(
    user: { id: string; email: string },
    ip?: string,
    ua?: string,
    db: RefreshTokenWriter = this.prisma,
  ) {
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const accessTtl = Number(this.config.get('JWT_ACCESS_TTL') || 900);
    const refreshTtl = Number(this.config.get('JWT_REFRESH_TTL') || 2592000);

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, type: 'access' } satisfies JwtPayload,
      { secret: accessSecret, expiresIn: accessTtl, algorithm: JWT_ALG, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
    );

    // 256 bit di entropia dal CSPRNG; nel DB resta solo lo SHA-256.
    const refreshToken = randomBytes(32).toString('base64url');
    const record = await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        userAgent: ua,
        ip,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, accessTokenExpiresIn: accessTtl, refreshToken, refreshTokenExpiresAt: record.expiresAt.toISOString(), refreshId: record.id };
  }

  private hashToken(t: string): string {
    return createHash('sha256').update(t).digest('hex');
  }

  publicUser(u: any) {
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      accountType: u.accountType,
      status: u.status,
      emailVerified: u.emailVerified,
      mfaEnabled: u.mfaEnabled,
    };
  }
}
