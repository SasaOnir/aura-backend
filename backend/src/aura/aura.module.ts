import { Module } from '@nestjs/common';
import { AuraController } from './aura.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuraController],
})
export class AuraModule {}
