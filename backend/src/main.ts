import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { SuperAdminBootstrap } from './bootstrap/super-admin.bootstrap';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, bodyParser: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const isProd = config.get<string>('NODE_ENV') === 'production';

  // Dietro un reverse proxy (Render, Cloudflare, nginx) indica quanti hop fidarsi.
  // 0 = nessun proxy: req.ip è l'IP della connessione. Mai 'true' (si fiderebbe di tutto).
  app.set('trust proxy', Number(config.get('TRUST_PROXY') ?? 0));
  app.disable('x-powered-by');

  // Limiti body: un JSON enorme verso /auth/* è un vettore di DoS (argon2, parsing).
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { extended: false, limit: '100kb' });

  app.use(
    helmet({
      hsts: isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());

  const corsOrigin = config.get<string>('CORS_ORIGIN') || 'http://localhost:3000';
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: false, // l'API usa Authorization: Bearer; il cookie del refresh token vive solo sul BFF
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.getHttpAdapter().get('/health', (_req: any, res: any) => res.json({ status: 'ok', ts: Date.now() }));

  app.enableShutdownHooks();

  const port = Number(config.get('PORT') || 4000);
  await app.listen(port);

  logger.log(`Aura backend in ascolto su :${port} (${isProd ? 'production' : 'development'})`);
  logger.log(`CORS origin: ${corsOrigin} | trust proxy: ${config.get('TRUST_PROXY') ?? 0}`);

  try {
    await app.get(SuperAdminBootstrap).run();
  } catch (e) {
    logger.error(`Bootstrap Super Admin fallito: ${(e as Error).message}`);
  }
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap:', err);
  process.exit(1);
});
