// Pages Router API route catch-all: wrappa il backend NestJS (AppModule)
// Tutte le richieste /api/* vanno qui. Il path /api viene rimosso prima di
// passare a NestJS (che ha route /auth/login, /admin/dashboard, ecc.).
//
// IMPORTANTE: importiamo da backend/dist/ (JS compilato da nest build),
// NON da backend/src/ (TS con decorator che Next webpack non sa parsare).

import type { NextApiRequest, NextApiResponse } from 'next';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe, ExceptionFilter, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

// path: frontend/src/pages/api/[[...all]].ts → ../../../../backend/dist/...
const AppModule = require('../../../../backend/dist/app.module').AppModule;
const SuperAdminBootstrap = require('../../../../backend/dist/bootstrap/super-admin.bootstrap').SuperAdminBootstrap;

let cachedHandler: any = null;

// ExceptionFilter senza decorator @Catch() (registro manualmente con useGlobalFilters)
class LoggingExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const msg = exception?.message || String(exception);
    this.logger.error(`${req?.method} ${req?.url} → ${status}: ${msg}`);
    if (res.headersSent) return;
    const response: any = exception instanceof HttpException ? exception.getResponse() : null;
    res.status(status).json(
      typeof response === 'object' && response && !Array.isArray(response)
        ? response
        : { statusCode: status, message: msg, error: exception?.name },
    );
  }
}

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

  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.enableCors({
    origin: corsOrigin.split(',').map((o: string) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalFilters(new LoggingExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();

  try {
    const bootstrap = app.get(SuperAdminBootstrap);
    await bootstrap.run();
  } catch (e: any) {
    console.error('Bootstrap Super Admin fallito:', e.message);
  }

  cachedHandler = (req: any, res: any) => expressApp(req, res);
  return cachedHandler;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Rimuovi /api prefix dal path: /api/auth/login → /auth/login
    const origUrl = req.url || '';
    if (origUrl.startsWith('/api')) {
      // @ts-ignore: url è writable in Next API routes
      req.url = origUrl.replace(/^\/api/, '') || '/';
    }

    const app = await bootstrap();
    return app(req, res);
  } catch (e: any) {
    res.status(500).json({
      statusCode: 500,
      error: 'bootstrap_failed',
      message: e?.message || String(e),
    });
  }
}
