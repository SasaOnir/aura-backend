// Client API tipizzato per il backend NestJS di Aura.
// Salva access+refresh in memoria + localStorage (per dev). In produzione:
// httpOnly cookie settati dal backend (vedi auth.controller - da migrare).

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
    return false;
  }
}

export async function api<T = any>(
  path: string,
  opts: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const r = await fetch(`${API}${path}`, { ...opts, headers });

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
