import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type EmailTokenPurpose = 'verify_email' | 'password_reset' | 'staff_invite';

export const TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  verify_email: 24 * 3600_000,
  password_reset: 3600_000,
  staff_invite: 72 * 3600_000,
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Token monouso: 256 bit casuali, nel DB solo lo SHA-256, scadenza per scopo, un solo uso garantito in modo atomico. */
@Injectable()
export class EmailTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea un token; invalida quelli precedenti non usati dello stesso scopo (l'ultimo link ricevuto è l'unico valido). */
  async create(userId: string, purpose: EmailTokenPurpose): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.emailToken.create({
      data: { userId, purpose, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]) },
    });
    return raw;
  }

  /** Controlla senza consumare (serve a validare la password prima di bruciare il token). */
  async peek(raw: string, purposes: EmailTokenPurpose[]): Promise<{ userId: string; purpose: EmailTokenPurpose } | null> {
    const t = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!t || t.usedAt || t.expiresAt.getTime() < Date.now() || !purposes.includes(t.purpose as EmailTokenPurpose)) return null;
    return { userId: t.userId, purpose: t.purpose as EmailTokenPurpose };
  }

  /** Consuma: l'UPDATE condizionale garantisce che due richieste concorrenti non usino lo stesso token due volte. */
  async consume(raw: string, purposes: EmailTokenPurpose[]): Promise<{ userId: string; purpose: EmailTokenPurpose } | null> {
    const t = await this.peek(raw, purposes);
    if (!t) return null;
    const r = await this.prisma.emailToken.updateMany({ where: { tokenHash: sha256(raw), usedAt: null }, data: { usedAt: new Date() } });
    return r.count === 1 ? t : null;
  }
}
