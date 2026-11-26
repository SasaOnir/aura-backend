import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AuditController — consultazione del registro attività (read-only).
 * PRD §4.6: "Il registro deve essere protetto contro alterazioni e cancellazioni
 * da parte degli operatori ordinari." — Nessun endpoint di modifica/delete qui.
 */
@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.read')
  async list(
    @Req() req: Request,
    @Query('limit') limit = 50,
    @Query('cursor') cursor?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    const where: any = {};
    if (action) where.action = action;
    if (actorId) where.actorId = actorId;

    const items = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const nextCursor = items.length > take ? items.pop()?.id : null;
    return { items, nextCursor };
  }
}
