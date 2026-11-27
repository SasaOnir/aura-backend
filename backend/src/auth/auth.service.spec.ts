import { UnauthorizedException } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { AuthService } from './auth.service';

/** Mini "database" in memoria: abbastanza fedele da provare rotazione e riuso dei refresh token. */
function fakeDb() {
  const tokens: any[] = [];
  const audit: any[] = [];
  const user = { id: 'u1', email: 'a@b.it', status: 'active', passwordHash: null as string | null, displayName: 'A', accountType: 'artist', emailVerified: false, mfaEnabled: false };
  const refreshToken = {
    create: async ({ data }: any) => { const r = { id: 't' + (tokens.length + 1), revokedAt: null, replacedById: null, ...data }; tokens.push(r); return r; },
    findUnique: async ({ where }: any) => tokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
    updateMany: async ({ where, data }: any) => {
      const hit = tokens.filter((t) => (!where.id || t.id === where.id) && (!where.userId || t.userId === where.userId) && (where.revokedAt === null ? t.revokedAt === null : true));
      hit.forEach((t) => Object.assign(t, data));
      return { count: hit.length };
    },
    update: async ({ where, data }: any) => Object.assign(tokens.find((t) => t.id === where.id), data),
  };
  const db: any = {
    refreshToken,
    user: { findUnique: async ({ where }: any) => (where.id === user.id || where.email === user.email ? user : null), update: async () => user },
    auditLog: { create: async ({ data }: any) => { audit.push(data); return data; } },
  };
  db.$transaction = async (fn: any) => fn(db);
  return { db, tokens, audit, user };
}

const cfg: any = { getOrThrow: () => 'S'.repeat(64), get: () => undefined };
const jwt: any = { signAsync: async () => 'jwt.access.token' };

async function setup() {
  const f = fakeDb();
  f.user.passwordHash = await hash('Corretta-Password-9!', { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 });
  const svc = new AuthService(f.db, jwt, cfg, {} as any);
  await svc.onModuleInit();
  return { ...f, svc };
}

describe('AuthService', () => {
  it('login: stesso errore per password errata e utente inesistente, e registra il fallimento', async () => {
    const { svc, audit } = await setup();
    await expect(svc.login({ email: 'a@b.it', password: 'sbagliata-123' }, '1.2.3.4')).rejects.toThrow('Credenziali non valide.');
    await expect(svc.login({ email: 'nessuno@b.it', password: 'sbagliata-123' }, '1.2.3.4')).rejects.toThrow('Credenziali non valide.');
    expect(audit.filter((a) => a.action === 'auth.login' && a.result === 'failure')).toHaveLength(2);
  });

  it('login: account sospeso respinto con lo stesso errore generico', async () => {
    const { svc, user } = await setup();
    user.status = 'suspended';
    await expect(svc.login({ email: 'a@b.it', password: 'Corretta-Password-9!' })).rejects.toThrow('Credenziali non valide.');
  });

  it('refresh: ruota il token e il vecchio non vale più', async () => {
    const { svc, tokens } = await setup();
    const first = await svc.login({ email: 'a@b.it', password: 'Corretta-Password-9!' });
    const second = await svc.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens[0].revokedAt).not.toBeNull();
    expect(tokens[0].replacedById).toBe(tokens[1].id);
  });

  it('refresh: il riuso di un token revocato revoca TUTTE le sessioni e viene tracciato', async () => {
    const { svc, tokens, audit } = await setup();
    const first = await svc.login({ email: 'a@b.it', password: 'Corretta-Password-9!' });
    const second = await svc.refresh(first.refreshToken);
    await expect(svc.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException); // riuso
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
    await expect(svc.refresh(second.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException); // anche il legittimo è chiuso
    expect(audit.some((a) => a.action === 'auth.refresh_reuse_detected')).toBe(true);
  });

  it('refresh: token inventato respinto', async () => {
    const { svc } = await setup();
    await expect(svc.refresh('x'.repeat(40))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('register: rifiuta password deboli prima di toccare il database', async () => {
    const { svc } = await setup();
    await expect(svc.register({ email: 'n@b.it', password: 'password123', displayName: 'Nuovo', accountType: 'artist' })).rejects.toThrow();
  });

  it('logout: revoca il refresh token anche senza access token; poi il refresh fallisce', async () => {
    const { svc, tokens } = await setup();
    const first = await svc.login({ email: 'a@b.it', password: 'Corretta-Password-9!' });
    await expect(svc.logout(first.refreshToken)).resolves.toEqual({ ok: true });
    expect(tokens[0].revokedAt).not.toBeNull();
    await expect(svc.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout: token sconosciuto -> stessa risposta (nessuna informazione)', async () => {
    const { svc } = await setup();
    await expect(svc.logout('x'.repeat(40))).resolves.toEqual({ ok: true });
  });

  it('me: ritorna utente e permessi ordinati; account sospeso -> 401', async () => {
    const f = await setup();
    const svc = new AuthService(f.db, jwt, cfg, { getPermissions: async () => new Set(['users.read', 'audit.read']) } as any);
    const r = await svc.me('u1');
    expect(r.permissions).toEqual(['audit.read', 'users.read']);
    expect((r.user as any).passwordHash).toBeUndefined();
    f.user.status = 'suspended';
    await expect(svc.me('u1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login: espone la durata dell\'access token', async () => {
    const { svc } = await setup();
    const r = await svc.login({ email: 'a@b.it', password: 'Corretta-Password-9!' });
    expect(r.accessTokenExpiresIn).toBe(900);
  });
});
