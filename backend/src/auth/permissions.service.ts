import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PermissionsService — RBAC enforced lato server (PRD §5).
 *
 * Carica i permessi di un utente dal DB (user_roles + role_permissions,
 * escludendo ruoli revocati) e li mette in cache per la richiesta.
 *
 * Il PRD §5 richiede: "I permessi sono controllati lato server." — Nessuna
 * logica di autorizzazione vive nel frontend; il frontend nasconde solo
 * i bottoni, ma il backend rifiuta comunque l'azione.
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger('PermissionsService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ritorna il set di permission_key per l'utente (ruoli di sistema + org + artist).
   * Cache: durata breve via request-scoped; qui carichiamo ogni volta
   * (il Prisma pool di default è sufficiente; per scala alta aggiungere Redis).
   */
  async getPermissions(userId: string): Promise<Set<string>> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId, revokedAt: null },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    const perms = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.permissions) {
        perms.add(rp.permission.permissionKey);
      }
    }
    return perms;
  }

  /**
   * Verifica che l'utente abbia TUTTI i permessi richiesti (AND semantica).
   */
  async assertAll(userId: string, required: string[]): Promise<void> {
    if (required.length === 0) return;
    const userPerms = await this.getPermissions(userId);
    const missing = required.filter((p) => !userPerms.has(p));
    if (missing.length > 0) {
      this.logger.warn(`Accesso negato a ${userId}: mancanti ${missing.join(', ')}`);
      // Non svelare all'utente quali permessi mancano ( sicurezza )
      throw new ForbiddenException('Non hai i permessi per questa operazione.');
    }
  }

  /**
   * Verifica che l'utente abbia ALMENO UNO dei permessi (OR semantica).
   */
  async assertAny(userId: string, required: string[]): Promise<void> {
    if (required.length === 0) return;
    const userPerms = await this.getPermissions(userId);
    const ok = required.some((p) => userPerms.has(p));
    if (!ok) {
      this.logger.warn(`Accesso negato a ${userId}: nessuno dei permessi richiesti`);
      throw new ForbiddenException('Non hai i permessi per questa operazione.');
    }
  }

  /**
   * Verifica se l'utente è Super Admin (ruolo protetto).
   */
  async isSuperAdmin(userId: string): Promise<boolean> {
    const ur = await this.prisma.userRole.findFirst({
      where: { userId, revokedAt: null, role: { name: 'super_admin' } },
    });
    return !!ur;
  }
}
