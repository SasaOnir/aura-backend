// Backend-for-frontend (solo server). Il browser NON vede mai il refresh token:
// resta in un cookie httpOnly + Secure + SameSite=Strict impostato qui.
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const isProd = process.env.NODE_ENV === 'production';

// Il prefisso __Host- obbliga Secure + Path=/ + nessun Domain: il cookie non può essere
// sovrascritto da un sottodominio. In sviluppo (http) non è utilizzabile.
export const RT_COOKIE = isProd ? '__Host-aura_rt' : 'aura_rt';

/** Difesa CSRF: accetta solo POST dal nostro stesso sito (oltre a SameSite=Strict). */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const expected = process.env.APP_ORIGIN; // in produzione: https://tuodominio.it
  if (expected) return origin === expected;
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host'));
  } catch {
    return false;
  }
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function setRefreshCookie(res: NextResponse, token: string, expiresAtIso?: string) {
  const expires = expiresAtIso ? new Date(expiresAtIso) : undefined;
  res.cookies.set(RT_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    ...(expires && !isNaN(expires.getTime()) ? { expires } : {}),
  });
}

export function clearRefreshCookie(res: NextResponse) {
  res.cookies.set(RT_COOKIE, '', { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/', maxAge: 0 });
}

/**
 * Chiama il backend inoltrando IP e user-agent reali del client: senza X-Forwarded-For
 * il rate limit e l'audit del backend vedrebbero sempre l'IP del frontend.
 * Funziona solo se davanti a Next c'è un proxy fidato che SOVRASCRIVE X-Forwarded-For
 * (Cloudflare, Render, Vercel...) e se TRUST_PROXY del backend è pari al numero di hop.
 */
export async function callBackend(path: string, req: NextRequest, body: unknown, authorization?: string | null): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authorization && /^Bearer [\w.\-]+$/.test(authorization)) headers['Authorization'] = authorization;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) headers['X-Forwarded-For'] = xff;
  const ua = req.headers.get('user-agent');
  if (ua) headers['User-Agent'] = ua;
  try {
    const r = await fetch(`${BACKEND}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  } catch {
    return { status: 502, data: { message: 'Servizio non raggiungibile.' } };
  }
}

/** Messaggi d'errore sicuri: mai inoltrare testo interno (stack, SQL, nomi di campi interni). */
export function errorResponse(status: number, data: any): NextResponse {
  if (status === 429) return json({ message: 'Troppi tentativi. Riprova tra qualche minuto.' }, 429);
  if (status >= 500) return json({ message: 'Servizio temporaneamente non disponibile.' }, 502);
  const m = data?.message;
  const message = Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : 'Richiesta non valida.';
  // Solo codici noti: la UI reagisce a EMAIL_NOT_VERIFIED, ma non inoltriamo campi arbitrari.
  const code = data?.code === 'EMAIL_NOT_VERIFIED' ? data.code : undefined;
  return json({ message: message.slice(0, 300), ...(code ? { code } : {}) }, status);
}

/** Risposta di login/registrazione/refresh: access token nel body, refresh token SOLO nel cookie. */
export function sessionResponse(status: number, data: any): NextResponse {
  if (status < 200 || status >= 300 || !data?.refreshToken || !data?.accessToken) return errorResponse(status < 400 ? 502 : status, data);
  const res = json({ user: data.user, accessToken: data.accessToken, accessTokenExpiresIn: data.accessTokenExpiresIn }, 200);
  setRefreshCookie(res, data.refreshToken, data.refreshTokenExpiresAt);
  return res;
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Login: sessione completa, oppure uno dei passi MFA (nessun cookie finché il secondo fattore non è superato). */
export function loginResponse(status: number, data: any): NextResponse {
  if (status >= 200 && status < 300) {
    if (data?.mfaRequired && typeof data.mfaToken === 'string') return json({ mfaRequired: true, mfaToken: data.mfaToken });
    if (data?.mfaEnrollmentRequired && typeof data.enrollToken === 'string') return json({ mfaEnrollmentRequired: true, enrollToken: data.enrollToken });
  }
  return sessionResponse(status, data);
}

/** Risposte semplici dal backend (ok/message/secret/otpauthUri/recoveryCodes): inoltrate solo se 2xx. */
export function passthrough(status: number, data: any): NextResponse {
  if (status < 200 || status >= 300) return errorResponse(status, data);
  const { refreshToken, refreshTokenExpiresAt, ...safe } = data ?? {};
  const res = json(safe, 200);
  if (typeof refreshToken === 'string') setRefreshCookie(res, refreshToken, refreshTokenExpiresAt); // es. attivazione MFA dello staff: completa il login
  return res;
}
