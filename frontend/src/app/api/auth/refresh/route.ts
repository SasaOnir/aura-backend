import { NextRequest } from 'next/server';
import { RT_COOKIE, callBackend, clearRefreshCookie, errorResponse, json, sameOrigin, sessionResponse } from '@/lib/bff';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ message: 'Origine non consentita.' }, 403);
  const rt = req.cookies.get(RT_COOKIE)?.value;
  if (!rt) return json({ message: 'Nessuna sessione.' }, 401);
  const { status, data } = await callBackend('/auth/refresh', req, { refreshToken: rt });
  if (status === 401) {
    const res = json({ message: 'Sessione scaduta.' }, 401);
    clearRefreshCookie(res); // token non più valido (o riuso rilevato): niente cookie morto
    return res;
  }
  if (status >= 500) return errorResponse(status, data); // errore temporaneo: NON cancellare il cookie
  return sessionResponse(status, data);
}
