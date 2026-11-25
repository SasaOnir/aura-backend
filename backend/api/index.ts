// API handler per Vercel — usa il backend PRE-COMPILATO in dist/
// Vercel builda il backend con 'npm run build' (nest build) → dist/main.js
// Questo handler importa il Nest app già compilato e lo wrappa per serverless.
//
// IMPORTANTE: questo file viene eseguito da Vercel come Node function.
// Usa require() (CommonJS) per importare dal dist/ compilato.
// NON importare '@vercel/node' (è un runtime Vercel, non una dep npm).

// Tipi minimali (no @vercel/node dep)
type VercelRequest = any;
type VercelResponse = any;

// @ts-ignore — dist viene generato dal buildCommand (nest build → dist/, NO dist/src/)
const { AppModule } = require('../dist/app.module.js');
// @ts-ignore
const { SuperAdminBootstrap } = require('../dist/bootstrap/super-admin.bootstrap.js');
// @ts-ignore
const { NestFactory } = require('@nestjs/core');
// @ts-ignore
const { ExpressAdapter } = require('@nestjs/platform-express');
// @ts-ignore
const { ValidationPipe } = require('@nestjs/common');
// @ts-ignore
const express = require('express');
// @ts-ignore
const serverlessExpress = require('@vendia/serverless-express');
// @ts-ignore
const helmet = require('helmet');
// @ts-ignore
const cookieParser = require('cookie-parser');

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
    res.json({ status: 'ok', ts: Date.now() }),
  );

  await app.init();

  try {
    const bootstrap = app.get(SuperAdminBootstrap);
    await bootstrap.run();
  } catch (e: any) {
    console.error('Bootstrap Super Admin fallito:', e.message);
  }

  cachedHandler = serverlessExpress({ app: expressApp });
  return cachedHandler;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await bootstrap();
  return app(req, res);
}
