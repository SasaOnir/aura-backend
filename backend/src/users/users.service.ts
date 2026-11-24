import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService');

  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { limit?: number; cursor?: string; search?: string; accountType?: string }) {
    const take = Math.min(Number(opts.limit) || 50, 200);
    const where: any = {};
    if (opts.accountType) where.accountType = opts.accountType;
    if (opts.search) {
      where.OR = [
        { email: { contains: opts.search, mode: 'insensitive' } },
        { displayName: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    const items = await this.prisma.user.findMany({
      where,
      select: publicUserSelect,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const nextCursor = items.length > take ? items.pop()?.id : null;
    return { items, nextCursor };
  }

  async get(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!u) throw new NotFoundException('Utente non trovato.');
    return u;
  }

  async getProfile(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...publicUserSelect,
        profile: true,
        userRoles: {
          where: { revokedAt: null },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
        adminAccount: true,
      },
    });
    if (!u) throw new NotFoundException('Utente non trovato.');
    return u;
  }

  async suspend(id: string, reason: string, actorId: string) {
    if (id === actorId) throw new ConflictException('Non puoi sospendere te stesso.');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Utente non trovato.');

    // Guard: il Super Admin non può essere sospeso da altri (PRD §5)
    const isSuper = await this.prisma.userRole.findFirst({
      where: { userId: id, revokedAt: null, role: { name: 'super_admin' } },
    });
    if (isSuper) throw new ConflictException('Il Super Admin non può essere sospeso.');

    return this.prisma.user.update({
      where: { id },
      data: { status: 'suspended' },
      select: publicUserSelect,
    });
  }

  async reactivate(id: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Utente non trovato.');
    return this.prisma.user.update({
      where: { id },
      data: { status: 'active' },
      select: publicUserSelect,
    });
  }

  async export(id: string, actorId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        userRoles: { where: { revokedAt: null }, include: { role: true } },
        notifications: { take: 100, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!u) throw new NotFoundException('Utente non trovato.');
    // GDPR art.20 — portabilità: ritorna tutto in JSON.
    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        accountType: u.accountType,
        status: u.status,
        createdAt: u.createdAt,
      },
      profile: u.profile,
      roles: u.userRoles.map((ur) => ({ name: ur.role.name, scope: ur.role.scope })),
      notifications: u.notifications,
    };
  }

  async delete(id: string, actorId: string) {
    if (id === actorId) throw new ConflictException('Non puoi cancellare te stesso (usa apposito flusso).');
    const isSuper = await this.prisma.userRole.findFirst({
      where: { userId: id, revokedAt: null, role: { name: 'super_admin' } },
    });
    if (isSuper) throw new ConflictException('Il Super Admin non può essere cancellato.');

    // GDPR art.17 — cancellazione. Soft-delete via status='deleted' (dati per retention).
    // In produzione: job asincrono che hard-delete dopo 30gg se nessun vincolo legale.
    return this.prisma.user.update({
      where: { id },
      data: { status: 'deleted', email: `deleted+${id}@aura.local`, displayName: 'Utente cancellato' },
      select: { id: true },
    });
  }
}

export const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  accountType: true,
  status: true,
  emailVerified: true,
  mfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
} as const;
