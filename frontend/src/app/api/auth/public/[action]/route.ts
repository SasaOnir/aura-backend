import { NextRequest } from 'next/server';
import { callBackend, json, passthrough, readJson, sameOrigin } from '@/lib/bff';

// Endpoint pubblici senza sessione: solo quelli in lista. Il corpo è ricostruito campo per campo.
const ACTIONS: Record<string, string[]> = {
  'verify-email': ['token'],
  'resend-verification': ['email'],
  'forgot-password': ['email'],
  'set-password': ['token', 'password'],
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const fields = ACTIONS[action];
  if (!fields) return json({ message: 'Non trovato.' }, 404);
  if (!sameOrigin(req)) return json({ message: 'Origine non consentita.' }, 403);
  const b = await readJson(req);
  if (!b || fields.some((f) => typeof b[f] !== 'string')) return json({ message: 'Dati mancanti.' }, 400);
  const body = Object.fromEntries(fields.map((f) => [f, b[f]]));
  const { status, data } = await callBackend(`/auth/${action}`, req, body);
  return passthrough(status, data);
}
