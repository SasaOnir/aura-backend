import { NextRequest } from 'next/server';
import { callBackend, json, loginResponse, readJson, sameOrigin } from '@/lib/bff';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ message: 'Origine non consentita.' }, 403);
  const b = await readJson(req);
  if (!b || typeof b.email !== 'string' || typeof b.password !== 'string') return json({ message: 'Dati mancanti.' }, 400);
  const { status, data } = await callBackend('/auth/login', req, { email: b.email, password: b.password });
  return loginResponse(status, data);
}
