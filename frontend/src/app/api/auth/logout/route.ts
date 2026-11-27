import { NextRequest } from 'next/server';
import { RT_COOKIE, callBackend, clearRefreshCookie, json, sameOrigin } from '@/lib/bff';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ message: 'Origine non consentita.' }, 403);
  const rt = req.cookies.get(RT_COOKIE)?.value;
  if (rt) await callBackend('/auth/logout', req, { refreshToken: rt }); // revoca lato server
  const res = json({ ok: true });
  clearRefreshCookie(res); // il cookie si cancella comunque
  return res;
}
