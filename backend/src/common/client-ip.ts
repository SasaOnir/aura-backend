import { isIP } from 'net';
import type { Request } from 'express';

/**
 * IP del client, sicuro da usare nella colonna INET.
 * Si usa req.ip (che rispetta 'trust proxy' configurato in main.ts) e NON
 * l'header x-forwarded-for grezzo, falsificabile dal client. Un valore non
 * valido farebbe fallire l'INSERT dell'audit log (evasione dell'audit).
 */
export function clientIp(req: Request): string | undefined {
  const raw = req.ip || req.socket?.remoteAddress;
  if (!raw) return undefined;
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  return isIP(ip) ? ip : undefined;
}
