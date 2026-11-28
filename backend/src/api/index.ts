// API handler per Vercel — NestJS completo con Express instance diretta
// Prisma 6 + adapter-neon (no binary query engine) → compatibile Node 26.
//
// Stack:
// - NestJS Express adapter (app.init() poi expressApp(req,res) come handler)
// - Prisma 6 + @prisma/adapter-neon (driver JS puro via @neondatabase/serverless)
// - Bootstrap Super Admin idempotente al primo cold start
// - Error handler Express + DebugExceptionFilter per visibilità errori

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe, ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { SuperAdminBootstrap } from '../bootstrap/super-admin.bootstrap';
import { SPA_HTML } from '../web/web.controller';

// Path prefix gestiti dai controller NestJS — tutto il resto serve la SPA admin.
const API_PREFIXES = ['/auth', '/users', '/roles', '/staff', '/audit', '/admin', '/health', '/music', '/aura'];

// Exception filter che logga e ritorna errore strutturato (utile in serverless
// dove i log runtime non sono sempre visibili via API)
@Catch()
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

let cachedHandler: any = null;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
  });

  // Helmet con CSP permissiva: la home page HTML usa script inline (single-page),
  // quindi permettiamo 'unsafe-inline' su script-src. img-src/style-src ampi per
  // eventuali avatar/risorse esterne. connect-src punta allo stesso dominio.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
      },
    },
  }));
  app.use(cookieParser());

  const corsOrigin = process.env.CORS_ORIGIN || 'https://aura-backend-rouge.vercel.app';
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

  app.getHttpAdapter().get('/health', (_req: any, res: any) =>
    res.json({ status: 'ok', ts: Date.now() }),
  );

  await app.init();

  // SPA fallback (Express-level, dopo app.init() così non shadowa i controller NestJS):
  // per ogni path NON-API, serve la SPA admin (hash-routing client-side /#/login /#/dashboard...).
  // I controller NestJS hanno rotte più specifiche e vincono; questo catch-all
  // intercetta solo ciò che nessun controller ha gestito.
  expressApp.use((req, res) => {
    const p = req.path;
    if (API_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/') || p.startsWith(prefix + '.'))) {
      res.status(404).json({ statusCode: 404, message: 'Not found' });
      return;
    }
    res.type('text/html').send(SPA_HTML);
  });

  // Bootstrap Super Admin (idempotente, una tantum al primo cold start)
  try {
    const bootstrap = app.get(SuperAdminBootstrap);
    await bootstrap.run();
  } catch (e: any) {
    console.error('Bootstrap Super Admin fallito:', e.message);
  }

  // Handler = Express instance diretta (NO @vendia/serverless-express, abbandonato)
  cachedHandler = (req: any, res: any) => expressApp(req, res);
  return cachedHandler;
}

export default async function handler(req: any, res: any) {
  try {
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
