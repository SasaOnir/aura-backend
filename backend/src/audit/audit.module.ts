import { Module } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor';
import { AuditController } from './audit.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [AuditInterceptor],
  controllers: [AuditController],
  exports: [AuditInterceptor],
})
export class AuditModule {}
