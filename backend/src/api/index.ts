// API handler per Vercel — NestJS + Express instance diretta (NO @vendia/serverless-express)
// @vendia/serverless-express è abbandonato 2022 e crasha su Node 26.
// Usiamo app.getHttpAdapter().getInstance() (Express) come handler diretto.

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { SuperAdminBootstrap } from '../bootstrap/super-admin.bootstrap';

let cachedHandler: any = null;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
  });

  app.use(helmet());
  app.use(cookieParser());

  const corsOrigin = process.env.CORS_ORIGIN || 'https://aura-backend-rouge.vercel.app';
  app.enableCors({
    origin: corsOrigin.split(',').map((o: string) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.getHttpAdapter().get('/health', (_req: any, res: any) =>
    res.json({ status: 'ok', ts: Date.now(), nest: 'booted' }),
  );

  await app.init();

  // Bootstrap Super Admin (idempotente, una tantum)
  try {
    const bootstrap = app.get(SuperAdminBootstrap);
    await bootstrap.run();
  } catch (e: any) {
    console.error('Bootstrap Super Admin fallito:', e.message);
  }

  // Handler = Express instance diretta (NO @vendia/serverless-express)
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
      name: e?.name,
      code: e?.code,
    });
  }
}
