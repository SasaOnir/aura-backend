import { NextRequest } from 'next/server';
import { callBackend, json, passthrough, readJson, sameOrigin, sessionResponse } from '@/lib/bff';

// verify: pubblico (token MFA nel corpo) -> crea la sessione. setup/enable/disable: richiedono
// Authorization (access token oppure token di enrollment dello staff), inoltrato così com'è.
// enable può completare il login dello staff: in quel caso il refresh token finisce nel cookie.
const ACTIONS: Record<string, { fields: string[]; auth: boolean }> = {
  verify: { fields: [], auth: false },
  setup: { fields: [], auth: true },
  enable: { fields: ['code'], auth: true },
  disable: { fields: ['password', 'code'], auth: true },
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const spec = ACTIONS[action];
  if (!spec) return json({ message: 'Non trovato.' }, 404);
  if (!sameOrigin(req)) return json({ message: 'Origine non consentita.' }, 403);
  const b = (await readJson(req)) ?? {};

  if (action === 'verify') {
    if (typeof b.mfaToken !== 'string') return json({ message: 'Dati mancanti.' }, 400);
    const body: Record<string, string> = { mfaToken: b.mfaToken };
    if (typeof b.code === 'string') body.code = b.code;
    if (typeof b.recoveryCode === 'string') body.recoveryCode = b.recoveryCode;
    const { status, data } = await callBackend('/auth/mfa/verify', req, body);
    return sessionResponse(status, data);
  }

  const authz = req.headers.get('authorization');
  if (!authz) return json({ message: 'Non autenticato.' }, 401);
  if (spec.fields.some((f) => typeof b[f] !== 'string')) return json({ message: 'Dati mancanti.' }, 400);
  const body = Object.fromEntries(spec.fields.map((f) => [f, b[f]]));
  const { status, data } = await callBackend(`/auth/mfa/${action}`, req, body, authz);
  return passthrough(status, data);
}
