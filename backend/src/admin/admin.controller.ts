import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AdminController — Dashboard Super Admin (PRD §4 + Fase 1).
 * Espone KPI globali della piattaforma. In Fase 1 i KPI sono essenziali
 * (utenti, staff, audit). Negli step futuri si espande con catalogo/finanza.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard')
  @RequirePermissions('analytics.global')
  async dashboard() {
    const [
      totalUsers, listeners, artists, labels, staff,
      suspended, pendingVerification,
      activeStaff, mfaEnabledStaff,
      rolesCount, permissionsCount,
      auditToday, audit7d,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { accountType: 'listener' } }),
      this.prisma.user.count({ where: { accountType: 'artist' } }),
      this.prisma.user.count({ where: { accountType: 'label' } }),
      this.prisma.user.count({ where: { accountType: 'staff' } }),
      this.prisma.user.count({ where: { status: 'suspended' } }),
      this.prisma.user.count({ where: { status: 'pending_verification' } }),
      this.prisma.adminAccount.count({ where: { status: 'active' } }),
      this.prisma.adminAccount.count({ where: { mfaRequired: true, status: 'active' } }),
      this.prisma.role.count(),
      this.prisma.permission.count(),
      this.prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }),
    ]);

    return {
      users: {
        total: totalUsers, listeners, artists, labels, staff,
        suspended, pendingVerification,
      },
      staff: {
        active: activeStaff,
        mfaEnabled: mfaEnabledStaff,
        mfaCoverage: activeStaff ? Math.round((mfaEnabledStaff / activeStaff) * 100) : 0,
      },
      rbac: { roles: rolesCount, permissions: permissionsCount },
      audit: {
        today: auditToday,
        last7d: audit7d,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  @Get('recent-activity')
  @RequirePermissions('analytics.global')
  async recentActivity() {
    // AuditLog non ha una relazione tipata `actor` nello schema Prisma
    // (l'actor è referenziato tramite `actorId` ma senza `@relation`).
    // Recuperiamo i log, poi gli actor in un'unica query, e assembliamo il join.
    const logs = await this.prisma.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, displayName: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));
    return logs.map((l) => ({
      ...l,
      actor: l.actorId ? actorMap.get(l.actorId) ?? null : null,
    }));
  }
}
