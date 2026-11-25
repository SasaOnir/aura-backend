import '@vercel/node';  // marker per Vercel runtime
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { INestApplication } from '@nestjs/common';
import express from 'express';
import serverlessExpress from '@vendia/serverless-express';
import { AppModule } from '../src/app.module';
import { SuperAdminBootstrap } from '../src/bootstrap/super-admin.bootstrap';

// Cache globale dell'app NestJS per evitare cold start lenti
// (serverless: ogni invocation riusa lo stesso handler)
let cachedApp: INestApplication | null = null;
let cachedHandler: any = null;

async function bootstrapApp() {
  if (cachedHandler) return cachedHandler;

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
  });

  // Middleware (replica main.ts)
  const helmet = (await import('helmet')).default;
  app.use(helmet());
  const cookieParser = (await import('cookie-parser')).default;
  app.use(cookieParser());

  // CORS
  const corsOrigin = process.env.CORS_ORIGIN || 'https://aura-backend-rouge.vercel.app';
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Validation
  const { ValidationPipe } = await import('@nestjs/common');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Health endpoint (Vercel health check)
  app.getHttpAdapter().get('/health', (_req: any, res: any) =>
    res.json({ status: 'ok', ts: Date.now() }),
  );

  await app.init();

  // Bootstrap Super Admin (idempotente, una tantum)
  try {
    const bootstrap = app.get(SuperAdminBootstrap);
    await bootstrap.run();
  } catch (e: any) {
    console.error('Bootstrap Super Admin fallito:', e.message);
  }

  cachedApp = app;
  cachedHandler = serverlessExpress({ app: expressApp });
  return cachedHandler;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await bootstrapApp();
  return app(req, res);
}
