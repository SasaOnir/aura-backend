import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { Audit, AuditResource } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { StaffService } from './staff.service';
import { IsEmail, IsString, IsArray, IsBoolean, IsOptional, MinLength } from 'class-validator';

class InviteDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) displayName!: string;
  @IsArray() @IsString({ each: true }) roleNames!: string[];
  @IsBoolean() @IsOptional() sendInviteEmail?: boolean;
}

class AssignRoleDto {
  @IsString() roleName!: string;
  @IsString() @IsOptional() reason?: string;
}

class ReasonDto {
  @IsString() @IsOptional() reason?: string;
}

class RequireMfaDto {
  @IsBoolean() required!: boolean;
}

@Controller('staff')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(AuditInterceptor)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions('users.read')
  list() { return this.staff.listStaff(); }

  @Post('invite')
  @Audit('staff.invite') @AuditResource('user')
  @RequirePermissions('staff.invite')
  invite(@Body() dto: InviteDto) { return this.staff.invite(dto); }

  @Patch(':userId/assign-role')
  @Audit('staff.assign_role') @AuditResource('user')
  @RequirePermissions('staff.invite')
  assign(@Param('userId') userId: string, @Body() dto: AssignRoleDto, @Req() req: Request) {
    return this.staff.assignRole(userId, dto.roleName, (req as any).user.id, dto.reason);
  }

  @Patch(':userId/revoke-role')
  @Audit('staff.revoke_role') @AuditResource('user')
  @RequirePermissions('staff.revoke')
  revokeRole(@Param('userId') userId: string, @Body() dto: AssignRoleDto, @Req() req: Request) {
    return this.staff.revokeRole(userId, dto.roleName, (req as any).user.id, dto.reason);
  }

  @Patch(':userId/require-mfa')
  @Audit('staff.require_mfa') @AuditResource('user')
  @RequirePermissions('staff.require_mfa')
  requireMfa(@Param('userId') userId: string, @Body() dto: RequireMfaDto) {
    return this.staff.requireMfa(userId, dto.required);
  }

  @Patch(':userId/revoke')
  @Audit('staff.revoke') @AuditResource('user')
  @RequirePermissions('staff.revoke')
  revoke(@Param('userId') userId: string, @Body() dto: ReasonDto, @Req() req: Request) {
    return this.staff.revoke(userId, (req as any).user.id, dto.reason);
  }
}
