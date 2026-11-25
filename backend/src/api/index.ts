// API handler per Vercel — NestJS completo con Express instance diretta
// Prisma 6 + adapter-neon (no binary query engine) → compatibile Node 26.

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe, ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { SuperAdminBootstrap } from '../bootstrap/super-admin.bootstrap';

// Exception filter NestJS che ritorna il dettaglio errore (debug Vercel)
@Catch()
class DebugExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    console.error('NESTJS EXCEPTION:', req?.method, req?.url, exception?.message);
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const response: any = exception instanceof HttpException ? exception.getResponse() : null;
    res.status(status).json({
      error: 'nestjs_exception',
      message: exception?.message || String(exception),
      stack: exception?.stack?.split('\n').slice(0, 8),
      name: exception?.name,
      code: exception?.code,
      nestResponse: typeof response === 'object' ? response : { message: response },
      path: req?.url,
      method: req?.method,
    });
  }
}

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

  app.useGlobalFilters(new DebugExceptionFilter());

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

  // DEBUG: mostra le env vars DB (mascherate) per diagnosticare ERR_INVALID_URL
  app.getHttpAdapter().get('/debug-env', (_req: any, res: any) => {
    const mask = (s: string) => s ? s.replace(/:[^:@]+@/, ':***@').substring(0, 100) : '(undefined)';
    res.json({
      DATABASE_URL: mask(process.env.DATABASE_URL || ''),
      DIRECT_URL: mask(process.env.DIRECT_URL || ''),
      DATABASE_URL_UNPOOLED: mask(process.env.DATABASE_URL_UNPOOLED || ''),
      NEON_BRANCH: process.env.NEON_BRANCH || '(undefined)',
      hasDatabase: !!process.env.DATABASE_URL,
      hasDirect: !!process.env.DIRECT_URL,
      dbLen: (process.env.DATABASE_URL || '').length,
      directLen: (process.env.DIRECT_URL || '').length,
      JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || '(undefined)',
      JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || '(undefined)',
      JWT_ACCESS_SECRET_LEN: (process.env.JWT_ACCESS_SECRET || '').length,
      JWT_REFRESH_SECRET_LEN: (process.env.JWT_REFRESH_SECRET || '').length,
      NODE_ENV: process.env.NODE_ENV || '(undefined)',
    });
  });

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
