// API handler per Vercel — TEST: AppModule con solo ConfigModule + PrismaModule
// Niente AuthModule (Passport JWT), niente SuperAdminBootstrap (argon2).
// Isola se crash è PrismaClient o AuthModule/argon2.

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import express from 'express';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    PrismaModule,
  ],
})
class TestModule {}

let cachedHandler: any = null;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(TestModule, adapter, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
  });

  app.getHttpAdapter().get('/health', async (_req: any, res: any) => {
    try {
      const prisma = app.get('PrismaService');
      const count = await prisma.user.count();
      res.json({ status: 'ok', ts: Date.now(), test: 'config+prisma', users: count });
    } catch (e: any) {
      res.json({ status: 'ok', ts: Date.now(), test: 'config+prisma', dbError: e.message });
    }
  });

  await app.init();

  cachedHandler = (req: any, res: any) => expressApp(req, res);
  return cachedHandler;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await bootstrap();
    return app(req, res);
  } catch (e: any) {
    res.status(500).json({
      error: 'bootstrap_failed',
      message: e?.message || String(e),
      stack: e?.stack?.split('\n').slice(0, 10),
    });
  }
}
