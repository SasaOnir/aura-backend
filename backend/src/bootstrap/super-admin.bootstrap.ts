import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bootstrap del Super Admin iniziale.
 *
 * PRD §5: "Il Super Admin è unico ruolo proprietario iniziale."
 * PRD §Fase 1: "Account proprietario Super Admin".
 *
 * Esegue all'avvio del backend. Idempotente: se il Super Admin esiste già
 * (stessa email), salta. Se le env AURA_SUPERADMIN_* non sono impostate,
 * salta in modalità dev (logga un warning).
 *
 * Dopo il bootstrap, l'operatore può rimuovere le env dai file .env — il
 * sistema non le rileggerà mai più.
 */
@Injectable()
export class SuperAdminBootstrap {
  private readonly logger = new Logger('SuperAdminBootstrap');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async run(): Promise<void> {
    const email = this.config.get<string>('AURA_SUPERADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('AURA_SUPERADMIN_PASSWORD');
    const name = this.config.get<string>('AURA_SUPERADMIN_NAME') || 'Super Admin';

    if (!email || !password) {
      this.logger.warn('AURA_SUPERADMIN_* non impostate → bootstrap saltato (modalità dev).');
      return;
    }

    if (password.length < 12) {
      this.logger.error('AURA_SUPERADMIN_PASSWORD troppo corta (min 12 caratteri). Bootstrap saltato.');
      return;
    }

    // Già esiste?
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      this.logger.log(`Super Admin già esistente (${email}). Bootstrap saltato.`);
      return;
    }

    // Recupera il ruolo super_admin (seedato da db/schema.sql)
    const superAdminRole = await this.prisma.role.findUnique({ where: { name: 'super_admin' } });
    if (!superAdminRole) {
      this.logger.error('Ruolo super_admin non trovato. Eseguire db/schema.sql prima del primo avvio.');
      return;
    }

    // Hash argon2id (PRD §15: "Password conservate con algoritmi di hashing adeguati")
    const passwordHash = await hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      algorithm: 2, // argon2id
    });

    // Transazione: user + user_profile + admin_account + user_role + audit_log
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: name,
          accountType: 'staff',
          status: 'active',
          emailVerified: true,
        },
      });

      await tx.userProfile.create({ data: { userId: user.id, language: 'it' } });

      await tx.adminAccount.create({
        data: { userId: user.id, status: 'active', mfaRequired: true },
      });

      await tx.userRole.create({
        data: { userId: user.id, roleId: superAdminRole.id, grantedBy: user.id },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'superadmin.bootstrap',
          resourceType: 'user',
          resourceId: user.id,
          reason: 'Bootstrap iniziale del Super Admin proprietario',
          result: 'success',
        },
      });

      return user;
    });

    this.logger.log(`✅ Super Admin creato: ${result.email} (id: ${result.id})`);
    this.logger.log('⚠️  Puoi ora rimuovere AURA_SUPERADMIN_* dal file .env.');
  }
}
