import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { Audit, AuditResource } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { UsersService } from './users.service';
import { IsString, MinLength, IsOptional } from 'class-validator';

class ReasonDto {
  @IsString()
  @MinLength(3)
  @IsOptional()
  reason?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(AuditInterceptor)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  list(@Query('limit') limit?: string, @Query('cursor') cursor?: string, @Query('search') search?: string, @Query('accountType') accountType?: string) {
    return this.users.list({ limit: Number(limit), cursor, search, accountType });
  }

  @Get(':id')
  @RequirePermissions('users.read')
  get(@Param('id') id: string) {
    return this.users.getProfile(id);
  }

  @Patch(':id/suspend')
  @Audit('user.suspend')
  @AuditResource('user')
  @RequirePermissions('users.suspend')
  suspend(@Param('id') id: string, @Body() dto: ReasonDto, @Req() req: Request) {
    return this.users.suspend(id, dto.reason || '', (req as any).user.id);
  }

  @Patch(':id/reactivate')
  @Audit('user.reactivate')
  @AuditResource('user')
  @RequirePermissions('users.suspend')
  reactivate(@Param('id') id: string) {
    return this.users.reactivate(id);
  }

  @Get(':id/export')
  @Audit('user.export')
  @AuditResource('user')
  @RequirePermissions('users.export')
  export(@Param('id') id: string, @Req() req: Request) {
    return this.users.export(id, (req as any).user.id);
  }

  @Delete(':id')
  @Audit('user.delete')
  @AuditResource('user')
  @RequirePermissions('users.delete')
  delete(@Param('id') id: string, @Req() req: Request) {
    return this.users.delete(id, (req as any).user.id);
  }
}
