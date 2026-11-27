import { HttpException, HttpStatus, Injectable, BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { verify } from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret, parseKey } from '../common/crypto';
import { generateSecret, otpauthUri, verifyTotp, stepAt } from './totp';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const RECOVERY_CODES = 10;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private key(): Buffer { return parseKey(this.config.getOrThrow<string>('MFA_ENCRYPTION_KEY')); }

  /** Inizio configurazione: genera il segreto, lo salva CIFRATO ma non ancora attivo. */
  async setup(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.mfaEnabled) throw new ConflictException('MFA già attiva.');
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: encryptSecret(secret, this.key(), userId) } });
    return { secret, otpauthUri: otpauthUri('Aura', user.email, secret) };
  }

  /** Conferma con un primo codice valido: attiva MFA e restituisce i codici di recupero (mostrati UNA volta). */
  async enable(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) throw new BadRequestException('Avvia prima la configurazione MFA.');
    if (user.mfaEnabled) throw new ConflictException('MFA già attiva.');
    await this.assertNotLocked(user);

    const step = verifyTotp(decryptSecret(user.mfaSecret, this.key(), userId), code);
    if (step === null) {
      await this.recordFailure(userId);
      throw new BadRequestException('Codice non valido.');
    }
    const codes = Array.from({ length: RECOVERY_CODES }, () => {
      const h = randomBytes(8).toString('hex'); // 64 bit
      return `${h.slice(0, 8)}-${h.slice(8)}`;
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: sha256(c) })) });
      await tx.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaLastStep: BigInt(step), mfaFailedCount: 0, mfaLockedUntil: null } });
    });
    return { recoveryCodes: codes };
  }

  /**
   * Verifica al login (TOTP o codice di recupero). Protezioni: lockout dopo 5 errori (15 min, persistente nel DB:
   * vale anche per attacchi distribuiti su molti IP), anti-replay (un codice TOTP vale una sola volta),
   * codici di recupero monouso.
   */
  async verifyForLogin(userId: string, input: { code?: string; recoveryCode?: string }): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled || !user.mfaSecret) return false;
    await this.assertNotLocked(user);

    let ok = false;
    if (input.code) {
      const step = verifyTotp(decryptSecret(user.mfaSecret, this.key(), userId), input.code);
      if (step !== null) {
        const claimed = await this.prisma.user.updateMany({
          where: { id: userId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: BigInt(step) } }] },
          data: { mfaLastStep: BigInt(step) },
        });
        ok = claimed.count === 1; // 0 = codice già usato (replay)
      }
    } else if (input.recoveryCode) {
      const r = await this.prisma.mfaRecoveryCode.updateMany({
        where: { userId, codeHash: sha256(input.recoveryCode.toLowerCase()), usedAt: null },
        data: { usedAt: new Date(Date.now()) },
      });
      ok = r.count === 1;
    }

    if (!ok) { await this.recordFailure(userId); return false; }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaFailedCount: 0, mfaLockedUntil: null } });
    return true;
  }

  /** Disattivazione: serve la password E un codice valido; vietata agli account staff con MFA obbligatoria. */
  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled) throw new BadRequestException('MFA non attiva.');
    const admin = await this.prisma.adminAccount.findUnique({ where: { userId } });
    if (admin && admin.status === 'active' && admin.mfaRequired) {
      throw new ForbiddenException('L\'MFA è obbligatoria per il tuo account.');
    }
    const pwOk = !!user.passwordHash && (await verify(user.passwordHash, password).catch(() => false));
    if (!pwOk || !(await this.verifyForLogin(userId, { code }))) throw new UnauthorizedException('Password o codice non validi.');
    await this.resetMfa(userId);
  }

  /** Azzera l'MFA di un utente (disattivazione o reset da Super Admin per dispositivo perso). */
  async resetMfa(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null, mfaFailedCount: 0, mfaLockedUntil: null, mfaLastStep: null } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }

  private async assertNotLocked(user: { mfaLockedUntil: Date | null }) {
    if (user.mfaLockedUntil && user.mfaLockedUntil.getTime() > Date.now()) {
      throw new HttpException('Troppi tentativi. Riprova tra 15 minuti.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async recordFailure(userId: string) {
    const u = await this.prisma.user.update({ where: { id: userId }, data: { mfaFailedCount: { increment: 1 } } });
    if (u.mfaFailedCount >= MAX_FAILS) {
      await this.prisma.user.update({ where: { id: userId }, data: { mfaLockedUntil: new Date(Date.now() + LOCK_MS), mfaFailedCount: 0 } });
    }
  }
}
export { stepAt };
