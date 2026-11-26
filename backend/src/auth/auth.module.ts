import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      // I secret vengono iniettati via JwtService.registerAsync in AuthService? No: usiamo JwtStrategy con secretOptions.
      // Per il sign usiamo jwtService.signAsync con secret direttamente (vedi auth.service).
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PermissionsService, JwtAuthGuard, PermissionsGuard],
  exports: [AuthService, PermissionsService, JwtAuthGuard, PermissionsGuard],
})
export class AuthModule {}
