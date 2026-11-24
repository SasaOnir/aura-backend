import { Module } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor';
import { AuditController } from './audit.controller';

@Module({
  providers: [AuditInterceptor],
  controllers: [AuditController],
  exports: [AuditInterceptor],
})
export class AuditModule {}
