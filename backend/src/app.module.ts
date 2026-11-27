import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { StaffModule } from './staff/staff.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';
import { MusicModule } from './music/music.module';
import { AuraModule } from './aura/aura.module';
import { WebModule } from './web/web.module';
import { SuperAdminBootstrap } from './bootstrap/super-admin.bootstrap';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    StaffModule,
    AuditModule,
    AdminModule,
    MusicModule,
    AuraModule,
    WebModule,
  ],
  providers: [SuperAdminBootstrap],
})
export class AppModule {}
