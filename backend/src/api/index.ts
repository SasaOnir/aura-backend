// API handler per Vercel — NestJS completo con Express instance diretta
// Prisma 6 + adapter-neon (no binary query engine) → compatibile Node 26.

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

  // Error handler Express: cattura errori runtime delle route e li ritorna come JSON
  // (Vercel non mostra log runtime, questo ci dà visibilità)
  expressApp.use((err: any, req: any, res: any, next: any) => {
    console.error('ROUTE ERROR:', req.method, req.path, err?.message);
    if (res.headersSent) return next(err);
    res.status(500).json({
      error: 'route_failed',
      message: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 8),
      name: err?.name,
      code: err?.code,
    });
  });

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
    });
  }
}
