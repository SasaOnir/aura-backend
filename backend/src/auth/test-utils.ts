// Database in memoria per i test: abbastanza fedele da provare i flussi di autenticazione senza Postgres.
import { randomUUID } from 'crypto';

function match(row: any, where: any): boolean {
  return Object.entries(where || {}).every(([k, v]: [string, any]) => {
    if (k === 'OR') return (v as any[]).some((w) => match(row, w));
    const cur = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('lt' in v) return cur != null && cur < v.lt;
      if ('in' in v) return (v.in as any[]).includes(cur);
      return false;
    }
    return (cur ?? null) === (v ?? null) || (cur instanceof Date && v instanceof Date && +cur === +v);
  });
}

class Table {
  rows: any[] = [];
  constructor(private defaults: () => any = () => ({})) {}
  private apply(row: any, data: any) {
    for (const [k, v] of Object.entries(data) as [string, any][]) {
      if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] ?? 0) + v.increment; else row[k] = v;
    }
  }
  async findUnique({ where }: any) { return this.rows.find((r) => match(r, where)) ?? null; }
  async findFirst({ where }: any) { return this.rows.find((r) => match(r, where)) ?? null; }
  async findMany({ where }: any = {}) { return this.rows.filter((r) => match(r, where)); }
  async create({ data }: any) { const r = { id: randomUUID(), createdAt: new Date(), ...this.defaults() }; this.apply(r, data); this.rows.push(r); return r; }
  async createMany({ data }: any) { for (const d of data) await this.create({ data: d }); return { count: data.length }; }
  async update({ where, data }: any) { const r = this.rows.find((x) => match(x, where)); if (!r) throw new Error('not found'); this.apply(r, data); return r; }
  async updateMany({ where, data }: any) { const hit = this.rows.filter((r) => match(r, where)); hit.forEach((r) => this.apply(r, data)); return { count: hit.length }; }
  async deleteMany({ where }: any) { const n = this.rows.length; this.rows = this.rows.filter((r) => !match(r, where)); return { count: n - this.rows.length }; }
}

export function fakeDb() {
  const db: any = {
    user: new Table(() => ({ passwordHash: null, status: 'active', emailVerified: false, mfaSecret: null, mfaEnabled: false, mfaFailedCount: 0, mfaLockedUntil: null, mfaLastStep: null, accountType: 'artist', displayName: 'Utente' })),
    userProfile: new Table(), adminAccount: new Table(), auditLog: new Table(),
    refreshToken: new Table(() => ({ revokedAt: null, replacedById: null })),
    emailToken: new Table(() => ({ usedAt: null })),
    mfaRecoveryCode: new Table(() => ({ usedAt: null })),
  };
  db.$transaction = async (fn: any) => fn(db);
  return db;
}

export function fakeMail() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return { sent, sendSafe: (m: any) => sent.push(m), send: async (m: any) => { sent.push(m); } };
}

/** Estrae il token dal link nel testo dell'email (…#token=XYZ). */
export const tokenFrom = (text: string) => /#token=([A-Za-z0-9_-]+)/.exec(text)![1];
