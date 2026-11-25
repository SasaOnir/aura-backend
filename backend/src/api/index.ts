// API handler per Vercel — wrappa NestJS app come serverless handler
// Versione di test: Niente bootstrap Super Admin (argon2) per isolare il problema.

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import express from 'express';
import serverlessExpress from '@vendia/serverless-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';

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

  // TEST: NO bootstrap Super Admin (argon2) per isolare
  console.log('NestJS app inizializzata (no bootstrap SA)');

  cachedHandler = serverlessExpress({ app: expressApp });
  return cachedHandler;
}

export default async function handler(req: any, res: any) {
  const app = await bootstrap();
  return app(req, res);
}
