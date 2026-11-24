import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions.service';
import { RegisterDto, LoginDto } from './dto';

/**
 * Verifica se un hash argon2 esistente è stato generato con parametri diversi
 * da quelli attualmente in uso (e va quindi re-hashato).
 * @node-rs/argon2 non espone più `needRehash`; reimplementiamo il controllo
 * parsando il formato standard `$argon2id$v=19$m=<mem>,t=<time>,p=<par>$...`.
 */
function needRehash(
  hashStr: string,
  expected: { memoryCost: number; timeCost: number; parallelism: number },
): boolean {
  if (!hashStr || !hashStr.startsWith('$argon2')) return true;
  // formato: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
  const parts = hashStr.split('$');
  // parts[0] = "", parts[1] = "argon2id", parts[2] = "v=19", parts[3] = "m=19456,t=2,p=1"
  const params = parts[3] || '';
  const m = params.match(/m=(\d+),t=(\d+),p=(\d+)/);
  if (!m) return true;
  const [, mem, time, par] = m;
  return (
    Number(mem) !== expected.memoryCost ||
    Number(time) !== expected.timeCost ||
    Number(par) !== expected.parallelism
  );
}

export interface JwtPayload {
  sub: string;   // user id
  email: string;
  type: 'access' | 'refresh';
  jti?: string;  // refresh token id (per rotazione)
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
  ) {}

  // ─── Registrazione (utente base: listener o artist) ────────────────────
  async register(dto: RegisterDto, ip?: string, ua?: string) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email già registrata.');

    if (dto.password.length < 8) throw new UnauthorizedException('Password troppo corta (min 8).');

    const passwordHash = await hash(dto.password, {
      memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2,
    });

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName,
          accountType: dto.accountType,
          status: 'active',
          emailVerified: false, // in produzione: email di conferma
        },
      });
      await tx.userProfile.create({ data: { userId: u.id, language: 'it' } });
      await tx.auditLog.create({
        data: {
          actorId: u.id,
          action: 'user.register',
          resourceType: 'user',
          resourceId: u.id,
          ip: ip as any,
          userAgent: ua,
          result: 'success',
        },
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

    if (!user || !user.passwordHash) {
      // Non svelare quale dei due è sbagliato (anti user-enumeration)
      throw new UnauthorizedException('Credenziali non valide.');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('Account sospeso o non verificato.');
    }

    const ok = await verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Credenziali non valide.');

    // Re-hash se i parametri di argon2 sono cambiati (PRD §15)
    if (needRehash(user.passwordHash, { memoryCost: 19456, timeCost: 2, parallelism: 1 })) {
      const newHash = await hash(dto.password, { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 });
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'auth.login',
          resourceType: 'user',
          resourceId: user.id,
          ip: ip as any,
          userAgent: ua,
          result: 'success',
        },
      });
    });

    const tokens = await this.issueTokens(user, ip, ua);
    return { user: this.publicUser(user), ...tokens };
  }

  // ─── Refresh con rotation (PRD §15: sessioni sicure) ───────────────────
  async refresh(refreshToken: string, ip?: string, ua?: string) {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token non valido o scaduto.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.status !== 'active') throw new UnauthorizedException('Account non attivo.');

    // Rotazione: revoca il vecchio, emetti uno nuovo (anti riuso)
    const newTokens = await this.issueTokens(user, ip, ua);

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: this.parseUuid(newTokens.refreshId) },
    });

    return { user: this.publicUser(user), ...newTokens };
  }

  // ─── Logout ────────────────────────────────────────────────────────────
  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      // Logout totale: revoca tutti i refresh token attivi
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.prisma.auditLog.create({
      data: { actorId: userId, action: 'auth.logout', resourceType: 'user', resourceId: userId, result: 'success' },
    });
    return { ok: true };
  }

  // ─── Issue tokens ──────────────────────────────────────────────────────
  private async issueTokens(user: any, ip?: string, ua?: string) {
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const accessTtl = Number(this.config.get('JWT_ACCESS_TTL') || 900);
    const refreshTtl = Number(this.config.get('JWT_REFRESH_TTL') || 2592000);

    const payload: Omit<JwtPayload, 'type'> = { sub: user.id, email: user.email };

    const accessToken = await this.jwt.signAsync(
      { ...payload, type: 'access' },
      { secret: accessSecret, expiresIn: accessTtl },
    );
    const refreshToken = randomUUID() + '.' + randomUUID();

    // Salva il refresh token (hash) in DB
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        userAgent: ua,
        ip: ip as any,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: record.expiresAt.toISOString(),
      refreshId: record.id,
    };
  }

  private hashToken(t: string): string {
    return createHash('sha256').update(t).digest('hex');
  }
  private parseUuid(s: string): string {
    // Best-effort: refreshId è già UUID
    return s;
  }

  // ─── Public user shape (mai esporre passwordHash) ─────────────────────
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
