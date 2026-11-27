// Client API tipizzato per il backend NestJS di Aura.
//
// Modello di sessione:
//  - access token (15 min): SOLO in memoria JS. Mai in localStorage/sessionStorage.
//  - refresh token (30 gg): cookie httpOnly + Secure + SameSite=Strict, gestito dal BFF
//    (/api/auth/*, stesso sito). Il JavaScript della pagina non può leggerlo: un XSS non può rubarlo.

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  accountType: string;
  status: string;
  emailVerified?: boolean;
  mfaEnabled: boolean;
}
export interface Session { user: SessionUser; accessToken: string; accessTokenExpiresIn: number }

let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export function clearSession() { accessToken = null; }

async function bff<T = any>(path: string, body: unknown = {}, extraHeaders: Record<string, string> = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: data as T };
}

// ── Refresh: UNA sola richiesta alla volta ───────────────────────────────
// Il backend ruota il refresh token a ogni uso e tratta il riuso di un token vecchio
// come furto (chiude tutte le sessioni). Due refresh paralleli nella stessa scheda o in
// schede diverse causerebbero un falso allarme: quindi single-flight + Web Locks tra schede.
let inflight: Promise<Session | null> | null = null;

async function doRefresh(): Promise<Session | null> {
  const r = await bff<Session>('/api/auth/refresh');
  if (!r.ok) { accessToken = null; return null; }
  accessToken = r.data.accessToken;
  return r.data;
}

export function refreshSession(): Promise<Session | null> {
  if (!inflight) {
    const run = () => doRefresh();
    const locked = typeof navigator !== 'undefined' && 'locks' in navigator
      ? (navigator as any).locks.request('aura-refresh', run) as Promise<Session | null>
      : run();
    inflight = locked.finally(() => { inflight = null; });
  }
  return inflight;
}

export async function api<T = any>(path: string, opts: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const r = await fetch(`${API}${path}`, { ...opts, headers });

  if (r.status === 401 && retry) {
    const s = await refreshSession();
    if (s) return api<T>(path, opts, false);
    accessToken = null;
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Sessione scaduta');
  }

  if (!r.ok) {
    let msg: any = `HTTP ${r.status}`;
    try { const e = await r.json(); msg = e.message || msg; } catch {}
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  return r.json();
}

// ── Auth (passa dal BFF: imposta/rimuove il cookie del refresh token) ─────
export type LoginOutcome =
  | { kind: 'session'; session: Session }
  | { kind: 'mfa'; mfaToken: string }
  | { kind: 'enroll'; enrollToken: string };

export class ApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) { super(message); }
}

export async function apiLogin(email: string, password: string): Promise<LoginOutcome> {
  const r = await bff<any>('/api/auth/login', { email, password });
  if (!r.ok) throw new ApiError(r.data?.message || 'Accesso non riuscito.', r.data?.code, r.status);
  if (r.data.mfaRequired) return { kind: 'mfa', mfaToken: r.data.mfaToken };
  if (r.data.mfaEnrollmentRequired) return { kind: 'enroll', enrollToken: r.data.enrollToken };
  accessToken = r.data.accessToken;
  return { kind: 'session', session: r.data };
}

export async function apiMfaVerify(mfaToken: string, input: { code?: string; recoveryCode?: string }): Promise<Session> {
  const r = await bff<any>('/api/auth/mfa/verify', { mfaToken, ...input });
  if (!r.ok) throw new ApiError(r.data?.message || 'Codice non valido.', r.data?.code, r.status);
  accessToken = r.data.accessToken;
  return r.data;
}

/** Chiamate MFA autenticate: con `token` (enrollment staff) oppure con l'access token in memoria. */
async function bffAuth<T = any>(path: string, body: unknown, token?: string): Promise<T> {
  const call = () => bff<any>(path, body, { Authorization: `Bearer ${token ?? accessToken ?? ''}` });
  let r = await call();
  if (r.status === 401 && !token && (await refreshSession())) r = await call(); // access token scaduto
  if (!r.ok) throw new ApiError(r.data?.message || 'Operazione non riuscita.', r.data?.code, r.status);
  return r.data as T;
}

export const apiMfaSetup = (token?: string) => bffAuth<{ secret: string; otpauthUri: string }>('/api/auth/mfa/setup', {}, token);

/** Con il token di enrollment la conferma completa anche il login (cookie impostato dal BFF). */
export async function apiMfaEnable(code: string, token?: string): Promise<{ recoveryCodes: string[]; session?: Session }> {
  const d = await bffAuth<any>('/api/auth/mfa/enable', { code }, token);
  if (d.accessToken) { accessToken = d.accessToken; return { recoveryCodes: d.recoveryCodes, session: d }; }
  return { recoveryCodes: d.recoveryCodes };
}

export const apiMfaDisable = (password: string, code: string) => bffAuth('/api/auth/mfa/disable', { password, code });

export async function apiRegister(email: string, password: string, displayName: string, accountType: 'listener' | 'artist' | 'label'): Promise<string> {
  const r = await bff<any>('/api/auth/register', { email, password, displayName, accountType });
  if (!r.ok) throw new ApiError(r.data?.message || 'Registrazione non riuscita.', r.data?.code, r.status);
  return r.data.message as string;
}

/** Endpoint pubblici senza sessione (verifica email, password dimenticata, imposta password). */
export async function apiPublic(action: 'verify-email' | 'resend-verification' | 'forgot-password' | 'set-password', body: Record<string, string>): Promise<string | undefined> {
  const r = await bff<any>(`/api/auth/public/${action}`, body);
  if (!r.ok) throw new ApiError(r.data?.message || 'Operazione non riuscita.', r.data?.code, r.status);
  return r.data?.message as string | undefined;
}

export async function apiLogout(): Promise<void> {
  try { await bff('/api/auth/logout'); } finally { accessToken = null; }
}

export const apiMe = () => api<{ user: SessionUser; permissions: string[] }>('/auth/me');
export const apiLogoutAll = () => api('/auth/logout-all', { method: 'POST', body: '{}' });

// Admin
export const apiDashboard = () => api('/admin/dashboard');
export const apiRecentActivity = () => api('/admin/recent-activity');

// Users
export const apiUsersList = (params: { limit?: number; cursor?: string; search?: string; accountType?: string } = {}) => {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.cursor) q.set('cursor', params.cursor);
  if (params.search) q.set('search', params.search);
  if (params.accountType) q.set('accountType', params.accountType);
  return api(`/users?${q}`);
};
export const apiUserGet = (id: string) => api(`/users/${id}`);
export const apiUserSuspend = (id: string, reason: string) =>
  api(`/users/${id}/suspend`, { method: 'PATCH', body: JSON.stringify({ reason }) });
export const apiUserReactivate = (id: string) =>
  api(`/users/${id}/reactivate`, { method: 'PATCH', body: JSON.stringify({}) });
export const apiUserExport = (id: string) => api(`/users/${id}/export`);
export const apiUserDelete = (id: string) => api(`/users/${id}`, { method: 'DELETE' });

// Roles
export const apiRolesList = () => api('/roles');
export const apiRoleGet = (id: string) => api(`/roles/${id}`);
export const apiRoleCreate = (data: { name: string; scope: string; description?: string; permissionKeys?: string[] }) =>
  api('/roles', { method: 'POST', body: JSON.stringify(data) });
export const apiRoleUpdate = (id: string, data: any) =>
  api(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const apiRoleDelete = (id: string) => api(`/roles/${id}`, { method: 'DELETE' });
export const apiPermissionsList = () => api('/roles/permissions');

// Staff
export const apiStaffList = () => api('/staff');
export const apiStaffInvite = (data: { email: string; displayName: string; roleNames: string[] }) =>
  api('/staff/invite', { method: 'POST', body: JSON.stringify(data) });
export const apiStaffAssignRole = (userId: string, roleName: string, reason?: string) =>
  api(`/staff/${userId}/assign-role`, { method: 'PATCH', body: JSON.stringify({ roleName, reason }) });
export const apiStaffRevokeRole = (userId: string, roleName: string, reason?: string) =>
  api(`/staff/${userId}/revoke-role`, { method: 'PATCH', body: JSON.stringify({ roleName, reason }) });
export const apiStaffRequireMfa = (userId: string, required: boolean) =>
  api(`/staff/${userId}/require-mfa`, { method: 'PATCH', body: JSON.stringify({ required }) });
export const apiStaffRevoke = (userId: string, reason?: string) =>
  api(`/staff/${userId}/revoke`, { method: 'PATCH', body: JSON.stringify({ reason }) });

// Audit
export const apiAuditList = (params: { limit?: number; cursor?: string; action?: string; actorId?: string } = {}) => {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.cursor) q.set('cursor', params.cursor);
  if (params.action) q.set('action', params.action);
  if (params.actorId) q.set('actorId', params.actorId);
  return api(`/audit?${q}`);
};
