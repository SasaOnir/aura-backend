import { Module } from '@nestjs/common';
import { MusicController } from './music.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [MusicController],
})
export class MusicModule {}
