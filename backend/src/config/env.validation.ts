/**
 * Validazione delle variabili d'ambiente all'avvio.
 * In produzione l'app si rifiuta di partire con segreti deboli, di esempio
 * o uguali tra loro: meglio un crash all'avvio di un deploy vulnerabile.
 */
const PLACEHOLDER_MARKERS = ['cambiami', 'changeme', 'dev_', 'example', 'minioadmin', 'aura_dev_pw', 'superadmin_12345'];

function looksLikePlaceholder(v: string): boolean {
  const s = v.toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => s.includes(m));
}

export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const e = env as Record<string, string | undefined>;
  const isProd = e.NODE_ENV === 'production';
  const errors: string[] = [];

  const need = (k: string) => {
    if (!e[k] || String(e[k]).trim() === '') errors.push(`${k} è obbligatoria.`);
  };
  need('DATABASE_URL');
  need('JWT_ACCESS_SECRET');
  need('JWT_REFRESH_SECRET');

  if (e.JWT_ACCESS_SECRET && e.JWT_REFRESH_SECRET && e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
    errors.push('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devono essere diversi.');
  }

  if (isProd) {
    for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const v = e[k] || '';
      if (v.length < 48) errors.push(`${k}: in produzione servono almeno 48 caratteri (openssl rand -base64 64).`);
      if (looksLikePlaceholder(v)) errors.push(`${k}: valore di esempio non ammesso in produzione.`);
    }
    const cors = e.CORS_ORIGIN || '';
    if (!cors || /localhost|127\.0\.0\.1/.test(cors)) errors.push('CORS_ORIGIN: in produzione deve essere il dominio reale (https).');
    if (e.DATABASE_URL && looksLikePlaceholder(e.DATABASE_URL)) errors.push('DATABASE_URL contiene una password di esempio.');
    if (e.AURA_SUPERADMIN_PASSWORD) {
      if (e.AURA_SUPERADMIN_PASSWORD.length < 16 || looksLikePlaceholder(e.AURA_SUPERADMIN_PASSWORD)) {
        errors.push('AURA_SUPERADMIN_PASSWORD: min 16 caratteri e non di esempio in produzione.');
      }
    }
  }

  if (errors.length) {
    throw new Error('Configurazione non valida:\n - ' + errors.join('\n - '));
  }
  return env;
}
