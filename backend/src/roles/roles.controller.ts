import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { Audit, AuditResource } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { RolesService } from './roles.service';
import { IsString, IsIn, IsOptional, IsArray, MinLength } from 'class-validator';

class CreateRoleDto {
  @IsString() @MinLength(2)
  name: string;
  @IsString() @IsOptional() description?: string;
  @IsIn(['system', 'organization', 'artist'])
  scope: 'system' | 'organization' | 'artist';
  @IsArray() @IsString({ each: true }) @IsOptional()
  permissionKeys?: string[];
}

class UpdateRoleDto {
  @IsString() @IsOptional() description?: string;
  @IsArray() @IsString({ each: true }) @IsOptional() addPermissionKeys?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() removePermissionKeys?: string[];
}

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(AuditInterceptor)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('roles.read')
  list() { return this.roles.list(); }

  @Get('permissions')
  @RequirePermissions('roles.read')
  permissions() { return this.roles.permissionsList(); }

  @Get(':id')
  @RequirePermissions('roles.read')
  get(@Param('id') id: string) { return this.roles.get(id); }

  @Post()
  @Audit('role.create') @AuditResource('role')
  @RequirePermissions('roles.create')
  create(@Body() dto: CreateRoleDto) { return this.roles.create(dto); }

  @Patch(':id')
  @Audit('role.update') @AuditResource('role')
  @RequirePermissions('roles.update')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) { return this.roles.update(id, dto); }

  @Delete(':id')
  @Audit('role.delete') @AuditResource('role')
  @RequirePermissions('roles.delete')
  remove(@Param('id') id: string) { return this.roles.remove(id); }
}
