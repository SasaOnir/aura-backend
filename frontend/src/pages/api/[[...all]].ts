// Pages Router API route catch-all: wrappa il backend NestJS (AppModule)
// Tutte le richieste /api/* vanno qui. Il path /api viene rimosso prima di
// passare a NestJS (che ha route /auth/login, /admin/dashboard, ecc.).
//
// IMPORTANTE: importiamo da backend/dist/ (JS compilato da nest build),
// NON da backend/src/ (TS con decorator che Next webpack non sa parsare).

import type { NextApiRequest, NextApiResponse } from 'next';

let cachedHandler: any = null;
let bootError: string | null = null;

// Lazy require dentro funzione (catch errori di import) invece di top-level
async function bootstrap(): Promise<any> {
  if (bootError) throw new Error(bootError);
  if (cachedHandler) return cachedHandler;

  try {
    // Lazy require per catturare errori di load del backend
    const { NestFactory } = await import('@nestjs/core');
    const { ExpressAdapter } = await import('@nestjs/platform-express');
    const { ValidationPipe, ExceptionFilter, ArgumentsHost, HttpException, Logger } = await import('@nestjs/common');
    const express = (await import('express')).default;
    const helmet = (await import('helmet')).default;
    const cookieParser = (await import('cookie-parser')).default;

    // path: frontend/pages/api/[[...all]].ts → ../../../backend/dist/...
    const { AppModule } = require('../../../../backend/dist/app.module');
    const { SuperAdminBootstrap } = require('../../../../backend/dist/bootstrap/super-admin.bootstrap');

    // ExceptionFilter senza decorator @Catch() (registro manualmente)
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
  } catch (e: any) {
    bootError = `bootstrap_failed: ${e?.message || String(e)}\n${e?.stack || ''}`;
    throw new Error(bootError);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Endpoint di debug per vedere lo stato del bootstrap
  if (req.url?.startsWith('/api/__debug')) {
    return res.status(200).json({
      cachedHandler: !!cachedHandler,
      bootError,
      nodeVersion: process.version,
      hasNestCore: (() => { try { require('@nestjs/core'); return true; } catch (e: any) { return e.message; } })(),
      hasBackendDist: (() => { try { require('../../../../backend/dist/app.module'); return true; } catch (e: any) { return e.message; } })(),
    });
  }

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
      error: 'handler_failed',
      message: e?.message || String(e),
      stack: e?.stack?.split('\n').slice(0, 10),
    });
  }
}
