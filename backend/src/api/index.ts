// API handler per Vercel — wrappa NestJS app come serverless handler
// Versione di debug: cattura e ritorna gli errori come JSON per diagnosticare

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import express from 'express';
import serverlessExpress from '@vendia/serverless-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';

let cachedHandler: any = null;
let bootError: string | null = null;

async function bootstrap() {
  if (bootError) throw new Error(bootError);
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

  cachedHandler = serverlessExpress({ app: expressApp });
  return cachedHandler;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await bootstrap();
    return await app(req, res);
  } catch (e: any) {
    const errJson = {
      error: 'bootstrap_failed',
      message: e?.message || String(e),
      stack: e?.stack?.split('\n').slice(0, 10),
      name: e?.name,
      code: e?.code,
    };
    console.error('HANDLER ERROR:', JSON.stringify(errJson));
    res.status(500).json(errJson);
  }
}
