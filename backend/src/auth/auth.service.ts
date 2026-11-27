import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { needsRehash } from '../common/argon2-params';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions.service';
import { RegisterDto, LoginDto } from './dto';
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

export interface JwtPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
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
  ) {}

  async onModuleInit() {
    this.dummyHash = await hash(randomBytes(16).toString('hex'), ARGON_OPTS);
  }

  // ─── Registrazione ─────────────────────────────────────────────────────
  async register(dto: RegisterDto, ip?: string, ua?: string) {
    const email = dto.email.trim().toLowerCase();

    const policyError = checkPasswordPolicy(dto.password, { email, displayName: dto.displayName });
    if (policyError) throw new BadRequestException(policyError);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // TODO(fase 2): con la verifica email la risposta diventa identica per
      // email nuova ed esistente (anti-enumeration). Oggi la mitigazione è il
      // rate limit di 5 registrazioni/ora per IP.
      throw new ConflictException('Email già registrata.');
    }

    const passwordHash = await hash(dto.password, ARGON_OPTS);

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName.trim(),
          accountType: dto.accountType,
          status: 'active',
          emailVerified: false,
        },
      });
      await tx.userProfile.create({ data: { userId: u.id, language: 'it' } });
      await tx.auditLog.create({
        data: { actorId: u.id, action: 'user.register', resourceType: 'user', resourceId: u.id, ip, userAgent: ua, result: 'success' },
      });
      return u;
    });

    const tokens = await this.issueTokens(user, ip, ua);
    return { user: this.publicUser(user), ...tokens };
  }

  // ─── Login ─────────────────────────────────────────────────────────────
  async login(dto: LoginDto, ip?: string, ua?: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Verifica SEMPRE un hash (reale o fittizio): niente differenze di timing.
    const ok = await verify(user?.passwordHash || this.dummyHash, dto.password).catch(() => false);

    // Stesso errore per: utente inesistente, password errata, account non attivo.
    if (!user || !user.passwordHash || !ok || user.status !== 'active') {
      await this.auditLoginFailure(user?.id, ip, ua);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (needsRehash(user.passwordHash, ARGON_OPTS)) {
      const newHash = await hash(dto.password, ARGON_OPTS);
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'auth.login', resourceType: 'user', resourceId: user.id, ip, userAgent: ua, result: 'success' },
      });
    });

    const tokens = await this.issueTokens(user, ip, ua);
    return { user: this.publicUser(user), ...tokens };
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
    return { user: this.publicUser(outcome.user), ...outcome.tokens };
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
