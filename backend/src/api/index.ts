// API handler per Vercel — TEST: NestJS con AppModule MINIMALE (no Prisma/Passport/argon2)
// Isola se il crash è NestJS core o un modulo pesante (Prisma, argon2, Passport).

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Module, Controller, Get } from '@nestjs/common';
import express from 'express';

// AppModule minimale — solo un controller /health, zero dipendenze
@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', ts: Date.now(), test: 'nestjs-minimal' };
  }
}

@Module({
  controllers: [HealthController],
})
class MinimalModule {}

let cachedHandler: any = null;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(MinimalModule, adapter, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
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
