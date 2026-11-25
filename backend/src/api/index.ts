// API handler per Vercel — TEST: SOLO Express (no NestJS, no argon2, no Prisma)
// Isola se il crash è @vendia/serverless-express o NestJS/caricamento moduli.
// NOTA: Vercel nodeVersion forzato a 26.x.

import express from 'express';

let cachedHandler: any = null;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const expressApp = express();

  expressApp.get('/health', (_req: any, res: any) =>
    res.json({ status: 'ok', ts: Date.now(), test: 'express-only' }),
  );

  expressApp.all('*', (req: any, res: any) => {
    res.status(404).json({ error: 'not_found', path: req.path, test: 'express-only' });
  });

  // Usa Express instance direttamente (no @vendia/serverless-express)
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
