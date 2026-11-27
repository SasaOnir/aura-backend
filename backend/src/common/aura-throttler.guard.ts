import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler per IP; sul login il tracker include anche l'email, così un
 * attaccante non può provare password infinite su un singolo account
 * cambiando solo l'ordine delle richieste, e un IP condiviso (NAT) non blocca
 * gli altri account.
 */
@Injectable()
export class AuraThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = req.ip || 'unknown';
    const path: string = req.originalUrl || req.url || '';
    if (path.includes('/auth/login') || path.includes('/auth/resend-verification') || path.includes('/auth/forgot-password')) {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
      return `${ip}|${email}`;
    }
    return ip;
  }
}
