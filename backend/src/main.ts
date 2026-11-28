import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { SuperAdminBootstrap } from './bootstrap/super-admin.bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Sicurezza (PRD §15) — CSP permissiva per home page HTML con script inline
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

  // CORS restrictivo (PRD §15)
  const corsOrigin = config.get<string>('CORS_ORIGIN') || 'http://localhost:3000';
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Validazione globale — tutti i DTO devono passare class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // strip proprietà non dichiarate
      forbidNonWhitelisted: true, // 400 se ce ne sono
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Health endpoint (per Docker healthcheck + monitoring)
  app.getHttpAdapter().get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

  const port = Number(config.get('PORT') || 4000);
  await app.listen(port);

  logger.log(`Aura backend in ascolto su :${port}`);
  logger.log(`CORS origin: ${corsOrigin}`);

  // Bootstrap Super Admin — una sola volta, idempotente
  try {
    const bootstrap = app.get(SuperAdminBootstrap);
    await bootstrap.run();
  } catch (e) {
    logger.error(`Bootstrap Super Admin fallito: ${(e as Error).message}`);
  }
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap:', err);
  process.exit(1);
});
