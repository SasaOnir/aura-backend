import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage { to: string; subject: string; text: string; html?: string }

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * Invio email via Resend (API HTTP). Senza RESEND_API_KEY e fuori produzione il messaggio
 * viene scritto nel log (comodo in sviluppo). In produzione la chiave è obbligatoria (env.validation).
 * Il mittente (MAIL_FROM) deve appartenere a un dominio verificato su Resend, altrimenti l'invio fallisce.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  constructor(private readonly config: ConfigService) {}

  async send(msg: MailMessage): Promise<void> {
    const key = this.config.get<string>('RESEND_API_KEY');
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (!key) {
      if (isProd) throw new Error('RESEND_API_KEY mancante in produzione.');
      this.logger.warn(`[DEV, email non inviata] A: ${msg.to} | ${msg.subject}\n${msg.text}`);
      return;
    }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.config.get<string>('MAIL_FROM') || 'Aura <onboarding@resend.dev>',
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      // Il corpo dell'errore può contenere dettagli: va nei log, mai al client.
      throw new Error(`Resend HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
    }
  }

  /** Invio "fire and forget": una risposta HTTP non deve dipendere dal mailer (e non deve rivelare se l'account esiste). */
  sendSafe(msg: MailMessage): void {
    this.send(msg).catch((e) => this.logger.error(`Invio email fallito (${msg.subject}): ${(e as Error).message}`));
  }
}
