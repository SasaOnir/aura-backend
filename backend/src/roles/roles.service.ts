import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';

@Injectable()
export class RolesService {
  private readonly logger = new Logger('RolesService');
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

  async list() {
    return this.prisma.role.findMany({
      include: { _count: { select: { permissions: true, userRoles: { where: { revokedAt: null } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async permissionsList() {
    return this.prisma.permission.findMany({ orderBy: { category: 'asc' } });
  }

  async get(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Ruolo non trovato.');
    return role;
  }

  async create(data: { name: string; description?: string; scope: 'system' | 'organization' | 'artist'; permissionKeys?: string[] }, actorId: string) {
    const existing = await this.prisma.role.findUnique({ where: { name: data.name } });
    if (existing) throw new ConflictException('Nome ruolo già in uso.');
    // I ruoli di sistema li crea solo il Super Admin; gli altri solo con permessi che già possiedono.
    if (data.scope === 'system' && !(await this.permissions.isSuperAdmin(actorId))) {
      throw new ConflictException('Solo il Super Admin può creare ruoli di sistema.');
    }
    await this.permissions.assertCanGrant(actorId, data.permissionKeys ?? []);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { name: data.name, description: data.description, scope: data.scope, isProtected: false },
      });
      if (data.permissionKeys && data.permissionKeys.length > 0) {
        const perms = await tx.permission.findMany({ where: { permissionKey: { in: data.permissionKeys } } });
        if (perms.length !== data.permissionKeys.length) {
          throw new BadRequestException('Alcuni permission_key non esistono.');
        }
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
      return role;
    });
  }

  async update(id: string, data: { description?: string; addPermissionKeys?: string[]; removePermissionKeys?: string[] }, actorId: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Ruolo non trovato.');
    if (role.isProtected) {
      // Per i ruoli protetti (super_admin) non permettiamo modifiche ai permessi da API.
      throw new ConflictException(`Il ruolo '${role.name}' è protetto: i permessi sono fissi (seedati).`);
    }

    await this.permissions.assertCanGrant(actorId, data.addPermissionKeys ?? []);

    return this.prisma.$transaction(async (tx) => {
      if (data.description !== undefined) {
        await tx.role.update({ where: { id }, data: { description: data.description } });
      }
      if (data.addPermissionKeys && data.addPermissionKeys.length > 0) {
        const perms = await tx.permission.findMany({ where: { permissionKey: { in: data.addPermissionKeys } } });
        if (perms.length !== data.addPermissionKeys.length) {
          throw new BadRequestException('Alcuni permission_key non esistono.');
        }
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
      if (data.removePermissionKeys && data.removePermissionKeys.length > 0) {
        const perms = await tx.permission.findMany({ where: { permissionKey: { in: data.removePermissionKeys } } });
        await tx.rolePermission.deleteMany({
          where: { roleId: id, permissionId: { in: perms.map((p) => p.id) } },
        });
      }
      return tx.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
    });
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Ruolo non trovato.');
    if (role.isProtected) throw new ConflictException(`Il ruolo '${role.name}' è protetto e non può essere cancellato.`);
    // Verifica: nessun utente attivo assegnato
    const activeUsers = await this.prisma.userRole.count({ where: { roleId: id, revokedAt: null } });
    if (activeUsers > 0) throw new ConflictException(`Il ruolo ha ${activeUsers} utente/i assegnato/i. Revoca prima.`);
    return this.prisma.role.delete({ where: { id } });
  }
}
