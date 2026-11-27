import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';
import { EmailTokenService } from '../auth/email-token.service';
import { MfaService } from '../auth/mfa.service';
import { MailService, escapeHtml } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class StaffService {
  private readonly logger = new Logger('StaffService');
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly emailTokens: EmailTokenService,
    private readonly mfa: MfaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async listStaff() {
    return this.prisma.adminAccount.findMany({
      include: {
        user: { select: { id: true, email: true, displayName: true, status: true, lastLoginAt: true, mfaEnabled: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invite(data: {
    email: string;
    displayName: string;
    roleNames: string[];
    sendInviteEmail?: boolean;
  }, actorId: string) {
    const email = data.email.trim().toLowerCase();
    if (data.roleNames.length === 0) throw new BadRequestException('Almeno un ruolo è obbligatorio.');

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Utente già registrato.');

    const roles = await this.prisma.role.findMany({ where: { name: { in: data.roleNames } } });
    if (roles.length !== data.roleNames.length) {
      throw new BadRequestException('Alcuni ruoli non esistono.');
    }
    // PRD §5: "Nessun collaboratore può modificare il ruolo proprietario."
    if (roles.some((r) => r.name === 'super_admin')) {
      throw new BadRequestException('Non puoi assegnare il ruolo super_admin.');
    }

    for (const r of roles) await this.permissions.assertCanGrantRole(actorId, r.id);

    // Crea l'utente staff 'pending_verification' SENZA password: la imposta lui dal link ricevuto via email
    // (72 ore, monouso). Al primo accesso dovrà configurare l'MFA, obbligatoria per lo staff.
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, displayName: data.displayName, accountType: 'staff', status: 'pending_verification', emailVerified: false },
      });
      await tx.userProfile.create({ data: { userId: user.id, language: 'it' } });
      await tx.adminAccount.create({ data: { userId: user.id, status: 'active', mfaRequired: true } });
      for (const r of roles) {
        await tx.userRole.create({ data: { userId: user.id, roleId: r.id, grantedBy: actorId } });
      }
      return user;
    });

    const token = await this.emailTokens.create(created.id, 'staff_invite');
    const origin = (this.config.get<string>('APP_ORIGIN') || 'http://localhost:3000').replace(/\/$/, '');
    const link = `${origin}/set-password#token=${token}`;
    this.mail.sendSafe({
      to: created.email,
      subject: 'Aura — sei stato invitato come collaboratore',
      text: `Ciao ${created.displayName},\n\nsei stato invitato nel team di Aura. Imposta la tua password (il link vale 72 ore):\n${link}\n\nAl primo accesso dovrai configurare l'app di autenticazione (MFA).`,
      html: `<p>Ciao ${escapeHtml(created.displayName)},</p><p>sei stato invitato nel team di Aura. Imposta la tua password (il link vale 72 ore):</p><p><a href="${escapeHtml(link)}">Imposta password</a></p><p>Al primo accesso dovrai configurare l'app di autenticazione (MFA).</p>`,
    });
    return { id: created.id, email: created.email, displayName: created.displayName, status: created.status };
  }

  /** Dispositivo MFA perso e codici di recupero finiti: solo il Super Admin può azzerare l'MFA (l'utente la riconfigura al prossimo accesso). */
  async resetMfa(userId: string, actorId: string) {
    if (!(await this.permissions.isSuperAdmin(actorId))) throw new ForbiddenException('Solo il Super Admin può resettare l\'MFA.');
    if (userId === actorId) throw new ForbiddenException('Non puoi resettare la tua stessa MFA.');
    await this.mfa.resetMfa(userId);
    return { ok: true };
  }
  async assignRole(userId: string, roleName: string, actorId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utente non trovato.');
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new BadRequestException('Ruolo non trovato.');
    if (role.name === 'super_admin') {
      throw new ConflictException('Il ruolo super_admin non può essere assegnato via API.');
    }

    await this.permissions.assertCanGrantRole(actorId, role.id);

    const existing = await this.prisma.userRole.findFirst({
      where: { userId, roleId: role.id, revokedAt: null },
    });
    if (existing) throw new ConflictException('Ruolo già assegnato.');

    return this.prisma.userRole.create({
      data: { userId, roleId: role.id, grantedBy: actorId as any, reason },
    });
  }

  async revokeRole(userId: string, roleName: string, actorId: string, reason?: string) {
    if (userId === actorId) throw new ConflictException('Non puoi revocare il tuo stesso ruolo.');

    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new BadRequestException('Ruolo non trovato.');
    if (role.isProtected) throw new ConflictException(`Il ruolo '${role.name}' è protetto.`);
    await this.permissions.assertOutranks(actorId, userId);

    const ur = await this.prisma.userRole.findFirst({
      where: { userId, roleId: role.id, revokedAt: null },
    });
    if (!ur) throw new NotFoundException('L\'utente non ha questo ruolo.');

    return this.prisma.userRole.update({
      where: { id: ur.id },
      data: { revokedAt: new Date(), reason },
    });
  }

  async requireMfa(userId: string, required: boolean, actorId: string) {
    // Abbassare la protezione MFA di un account è un'azione da Super Admin.
    if (!required && !(await this.permissions.isSuperAdmin(actorId))) {
      throw new ForbiddenException('Solo il Super Admin può disattivare l\'obbligo MFA.');
    }
    const admin = await this.prisma.adminAccount.findUnique({ where: { userId } });
    if (!admin) throw new NotFoundException('Account staff non trovato.');
    return this.prisma.adminAccount.update({
      where: { userId },
      data: { mfaRequired: required },
    });
  }

  async revoke(userId: string, actorId: string, reason?: string) {
    if (userId === actorId) throw new ConflictException('Non puoi revocare te stesso.');
    const isSuper = await this.prisma.userRole.findFirst({
      where: { userId, revokedAt: null, role: { name: 'super_admin' } },
    });
    if (isSuper) throw new ConflictException('Il Super Admin non può essere revocato.');
    await this.permissions.assertOutranks(actorId, userId);

    return this.prisma.$transaction(async (tx) => {
      // Revoca tutti i ruoli attivi
      await tx.userRole.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), reason },
      });
      // Sospende l'account admin
      await tx.adminAccount.updateMany({
        where: { userId },
        data: { status: 'revoked' },
      });
      // Chiude tutte le sessioni e sospende l'utente
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.user.update({ where: { id: userId }, data: { status: 'suspended' } });
    });
  }
}
