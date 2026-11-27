// Client API tipizzato per il backend NestJS di Aura.
// Salva access+refresh in memoria + localStorage (per dev). In produzione:
// httpOnly cookie settati dal backend (vedi auth.controller - da migrare).
//
// Gestione backend non disponibile (PRD cloud-recovery):
//   - Quando il backend non è raggiungibile, le API lanciano BackendUnavailableError
//     invece di un errore generico. Le pagine possono distinguere questo caso
//     e mostrare uno stato realistico di "servizio non disponibile" SENZA
//     simulare operazioni riuscite (nessun dato fittizio spacciato per reale,
//     nessuna azione eseguita come se fosse andata a buon fine).
//   - Esiste una modalità "demo" esplicita (login.demo) che permette di
//     navigare il pannello con un utente fittizio SOLO client-side, per
//     ispezionare le schermate quando il backend è offline. In questa
//     modalità tutti i bottoni di azione sono disabilitati e ogni operazione
//     mostra "Servizio backend non disponibile".

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Flag demo: se true, l'utente ha scelto di navigare senza backend.
// Settato SOLO dal pulsante esplicito in /login, mai automaticamente.
let demoMode = false;
export function isDemoMode() { return demoMode; }
export function setDemoMode(v: boolean) { demoMode = v; }

// Errore tipizzato per "backend non raggiungibile" (vs errore HTTP dal backend).
export class BackendUnavailableError extends Error {
  constructor(message = 'Servizio backend non disponibile. Riprova più tardi.') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

let accessToken: string | null = null;
const REFRESH_KEY = 'aura_refresh_token';

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  if (typeof window !== 'undefined') localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens() {
  accessToken = null;
  if (typeof window !== 'undefined') localStorage.removeItem(REFRESH_KEY);
}
export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    // Errore di rete = backend non raggiungibile
    return false;
  }
}

export async function api<T = any>(
  path: string,
  opts: RequestInit = {},
  retry = true,
): Promise<T> {
  // In modalità demo non chiamiamo mai il backend: restituiamo sempre
  // BackendUnavailableError. Le pagine lo gestiscono mostrando uno stato
  // realistico di servizio non disponibile (nessun dato fittizio come se
  // fosse reale).
  if (demoMode) {
    throw new BackendUnavailableError();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  let r: Response;
  try {
    r = await fetch(`${API}${path}`, { ...opts, headers });
  } catch (e: any) {
    // fetch throw = errore di rete (DNS, connessione rifiutata, CORS, timeout).
    // Distinto da un errore HTTP (il backend ha risposto con 4xx/5xx).
    throw new BackendUnavailableError(
      'Il servizio backend non è raggiungibile. Verifica la connessione o riprova più tardi.'
    );
  }

  if (r.status === 401 && retry && accessToken) {
    // Try refresh once
    const ok = await refreshAccessToken();
    if (ok) return api<T>(path, opts, false);
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Sessione scaduta');
  }

  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const e = await r.json(); msg = e.message || msg; } catch {}
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return r.json();
}

export const apiLogin = (email: string, password: string) =>
  api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const apiRegister = (email: string, password: string, displayName: string, accountType: 'listener'|'artist'|'label') =>
  api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName, accountType }) });

export const apiLogout = () =>
  api('/auth/logout', { method: 'POST', body: JSON.stringify({}) });

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
