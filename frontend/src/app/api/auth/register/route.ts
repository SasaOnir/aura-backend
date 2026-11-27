import { NextRequest } from 'next/server';
import { callBackend, json, passthrough, readJson, sameOrigin } from '@/lib/bff';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ message: 'Origine non consentita.' }, 403);
  const b = await readJson(req);
  if (!b || typeof b.email !== 'string' || typeof b.password !== 'string' || typeof b.displayName !== 'string' || typeof b.accountType !== 'string') {
    return json({ message: 'Dati mancanti.' }, 400);
  }
  const { status, data } = await callBackend('/auth/register', req, {
    email: b.email, password: b.password, displayName: b.displayName, accountType: b.accountType,
  });
  return passthrough(status, data);
}
