import { validateEnv } from './env.validation';

const good = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://aura:Xk29vLqPz8wRtY4mNc7bHd3sFg6J@db:5432/aura',
  JWT_ACCESS_SECRET: 'A'.repeat(30) + 'b'.repeat(30),
  JWT_REFRESH_SECRET: 'C'.repeat(30) + 'd'.repeat(30),
  CORS_ORIGIN: 'https://aura.example.org',
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
});
