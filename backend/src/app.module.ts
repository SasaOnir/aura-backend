import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { AuraThrottlerGuard } from './common/aura-throttler.guard';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { StaffModule } from './staff/staff.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';
import { SuperAdminBootstrap } from './bootstrap/super-admin.bootstrap';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'], validate: validateEnv }),
    // Limite globale: 120 richieste/minuto per IP. Gli endpoint /auth/* hanno limiti più stretti.
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }] }),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    RolesModule,
    StaffModule,
    AuditModule,
    AdminModule,
  ],
  providers: [SuperAdminBootstrap, { provide: APP_GUARD, useClass: AuraThrottlerGuard }],
})
export class AppModule {}
