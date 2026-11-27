import { validateEnv } from './env.validation';

const good = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://aura:Xk29vLqPz8wRtY4mNc7bHd3sFg6J@db:5432/aura',
  JWT_ACCESS_SECRET: 'A'.repeat(30) + 'b'.repeat(30),
  JWT_REFRESH_SECRET: 'C'.repeat(30) + 'd'.repeat(30),
  CORS_ORIGIN: 'https://aura.example.org',
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  RESEND_API_KEY: 're_realkey_for_test',
  MAIL_FROM: 'Aura <noreply@aura-music.it>',
  APP_ORIGIN: 'https://aura-music.it',
};

describe('validateEnv', () => {
  it('accetta una configurazione di produzione corretta', () => {
    expect(() => validateEnv(good)).not.toThrow();
  });
  it('rifiuta segreti di esempio in produzione', () => {
    expect(() => validateEnv({ ...good, JWT_ACCESS_SECRET: 'cambiami_con_chiave_random_lunga_almeno_64_byte_xxxxxxxxxxxxxxxxxxxxxx' })).toThrow(/esempio/);
  });
  it('rifiuta segreti corti in produzione', () => {
    expect(() => validateEnv({ ...good, JWT_REFRESH_SECRET: 'corto' })).toThrow(/48 caratteri/);
  });
  it('rifiuta access e refresh secret uguali', () => {
    expect(() => validateEnv({ ...good, JWT_REFRESH_SECRET: good.JWT_ACCESS_SECRET })).toThrow(/diversi/);
  });
  it('rifiuta CORS su localhost in produzione', () => {
    expect(() => validateEnv({ ...good, CORS_ORIGIN: 'http://localhost:3000' })).toThrow(/CORS_ORIGIN/);
  });
  it('rifiuta la password Super Admin di default', () => {
    expect(() => validateEnv({ ...good, AURA_SUPERADMIN_PASSWORD: 'SuperAdmin_12345!' })).toThrow(/SUPERADMIN_PASSWORD/);
  });
  it('in sviluppo richiede comunque i segreti', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(/obbligatoria/);
  });
  it('MFA_ENCRYPTION_KEY: obbligatoria e lunga 32 byte', () => {
    const { MFA_ENCRYPTION_KEY, ...rest } = good;
    expect(() => validateEnv(rest)).toThrow(/MFA_ENCRYPTION_KEY/);
    expect(() => validateEnv({ ...good, MFA_ENCRYPTION_KEY: Buffer.from('corta').toString('base64') })).toThrow(/32 byte/);
  });
  it('produzione: richiede Resend, mittente su dominio verificato e APP_ORIGIN https', () => {
    expect(() => validateEnv({ ...good, RESEND_API_KEY: '' })).toThrow(/RESEND_API_KEY/);
    expect(() => validateEnv({ ...good, MAIL_FROM: 'Aura <onboarding@resend.dev>' })).toThrow(/MAIL_FROM/);
    expect(() => validateEnv({ ...good, APP_ORIGIN: 'http://aura-music.it' })).toThrow(/APP_ORIGIN/);
  });
});
