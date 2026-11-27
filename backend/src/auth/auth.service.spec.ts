import { ForbiddenException, UnauthorizedException, BadRequestException, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from '@node-rs/argon2';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { EmailTokenService } from './email-token.service';
import { MfaService } from './mfa.service';
import { base32Decode, hotp, stepAt } from './totp';
import { decryptSecret, parseKey } from '../common/crypto';
import { fakeDb, fakeMail, tokenFrom } from './test-utils';

const PW = 'Corretta-Password-9!';
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 } as const;
const KEY_B64 = randomBytes(32).toString('base64');
const cfg: any = { getOrThrow: (k: string) => ({ JWT_ACCESS_SECRET: 'S'.repeat(64), MFA_ENCRYPTION_KEY: KEY_B64 } as any)[k], get: (k: string) => ({ APP_ORIGIN: 'https://aura.test' } as any)[k] };

async function setup() {
  const db = fakeDb(); const mail = fakeMail();
  const emailTokens = new EmailTokenService(db);
  const mfa = new MfaService(db, cfg);
  const perms: any = { getPermissions: async () => new Set(['users.read']) };
  const svc = new AuthService(db, new JwtService(), cfg, perms, mail as any, emailTokens, mfa);
  await svc.onModuleInit();
  const mkUser = async (over: any = {}) => db.user.create({ data: { email: 'a@b.it', passwordHash: await hash(PW, ARGON), emailVerified: true, ...over } });
  const codeAt = (secretB32: string, ms: number) => hotp(base32Decode(secretB32), stepAt(ms));
  return { db, mail, svc, mfa, emailTokens, mkUser, codeAt };
}
const login = (svc: AuthService, email = 'a@b.it', password = PW) => svc.login({ email, password });

describe('registrazione (anti-enumeration)', () => {
  it('email nuova: account in attesa, nessun token, email con link nel fragment', async () => {
    const { svc, db, mail } = await setup();
    const r: any = await svc.register({ email: 'Nuovo@B.it', password: PW, displayName: 'Nuovo Artista', accountType: 'artist' });
    expect(r.accessToken).toBeUndefined(); expect(r.refreshToken).toBeUndefined();
    const u = db.user.rows[0];
    expect(u.status).toBe('pending_verification'); expect(u.emailVerified).toBe(false); expect(u.email).toBe('nuovo@b.it');
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].text).toContain('https://aura.test/verify-email#token=');
    expect(mail.sent[0].text).not.toContain('?token=');
  });
  it('risposta IDENTICA per email già registrata (verificata o in attesa) e nuova', async () => {
    const a = await setup();
    const fresh = await a.svc.register({ email: 'x@b.it', password: PW, displayName: 'Xx Xx', accountType: 'artist' });
    const b = await setup(); await b.mkUser();
    const verified = await b.svc.register({ email: 'a@b.it', password: PW, displayName: 'Altro Nome', accountType: 'artist' });
    const c = await setup(); await c.mkUser({ status: 'pending_verification', emailVerified: false });
    const pending = await c.svc.register({ email: 'a@b.it', password: PW, displayName: 'Altro Nome', accountType: 'artist' });
    expect(verified).toEqual(fresh); expect(pending).toEqual(fresh);
    expect(b.db.user.rows).toHaveLength(1);               // nessun duplicato
    expect(b.mail.sent[0].subject).toMatch(/tentativo di registrazione/);
    expect(c.mail.sent[0].text).toContain('/verify-email#token='); // pending: rinvia la verifica
  });
  it('password debole rifiutata', async () => {
    const { svc, db } = await setup();
    await expect(svc.register({ email: 'n@b.it', password: 'password123', displayName: 'Nuovo', accountType: 'artist' })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.user.rows).toHaveLength(0);
  });
});

describe('verifica email', () => {
  async function registered() {
    const s = await setup();
    await s.svc.register({ email: 'n@b.it', password: PW, displayName: 'Nuovo Artista', accountType: 'artist' });
    return { ...s, token: tokenFrom(s.mail.sent[0].text) };
  }
  it('attiva l\'account; il token è monouso', async () => {
    const { svc, db, token } = await registered();
    await expect(svc.verifyEmail(token)).resolves.toEqual({ ok: true });
    expect(db.user.rows[0]).toMatchObject({ status: 'active', emailVerified: true });
    await expect(svc.verifyEmail(token)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('token scaduto o inventato rifiutato; nel DB c\'è solo l\'hash', async () => {
    const { svc, db, token } = await registered();
    expect(db.emailToken.rows[0].tokenHash).not.toContain(token);
    db.emailToken.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(svc.verifyEmail(token)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.verifyEmail('x'.repeat(43))).rejects.toBeInstanceOf(BadRequestException);
  });
  it('un nuovo link invalida il precedente', async () => {
    const { svc, mail, token } = await registered();
    await svc.resendVerification('n@b.it');
    const newer = tokenFrom(mail.sent[1].text);
    await expect(svc.verifyEmail(token)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.verifyEmail(newer)).resolves.toEqual({ ok: true });
  });
  it('un token di reset password non vale come verifica email', async () => {
    const { svc, db, mail } = await registered();
    await db.user.update({ where: { email: 'n@b.it' }, data: { status: 'active' } });
    await svc.forgotPassword('n@b.it');
    await expect(svc.verifyEmail(tokenFrom(mail.sent[1].text))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('login', () => {
  it('stesso errore e fallimento tracciato: password errata / utente inesistente', async () => {
    const { svc, db, mkUser } = await setup(); await mkUser();
    await expect(login(svc, 'a@b.it', 'sbagliata-123')).rejects.toThrow('Credenziali non valide.');
    await expect(login(svc, 'nessuno@b.it')).rejects.toThrow('Credenziali non valide.');
    expect(db.auditLog.rows.filter((a: any) => a.action === 'auth.login' && a.result === 'failure')).toHaveLength(2);
  });
  it('email non verificata: 403 SOLO con password corretta (altrimenti errore generico)', async () => {
    const { svc, mkUser } = await setup(); await mkUser({ status: 'pending_verification', emailVerified: false });
    await expect(login(svc, 'a@b.it', 'sbagliata-123')).rejects.toThrow('Credenziali non valide.');
    const err: any = await login(svc).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException); expect(err.getResponse()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });
  it('account sospeso: errore generico', async () => {
    const { svc, mkUser } = await setup(); await mkUser({ status: 'suspended' });
    await expect(login(svc)).rejects.toThrow('Credenziali non valide.');
  });
  it('utente senza MFA né ruolo staff: sessione completa', async () => {
    const { svc, mkUser } = await setup(); await mkUser();
    const r: any = await login(svc);
    expect(r.accessToken).toBeDefined(); expect(r.refreshToken).toBeDefined(); expect(r.accessTokenExpiresIn).toBe(900); expect(r.refreshId).toBeUndefined();
  });
  it('MFA attiva: NESSUN token finché il secondo fattore non è superato', async () => {
    const { svc, mkUser } = await setup(); await mkUser({ mfaEnabled: true, mfaSecret: 'x' });
    const r: any = await login(svc);
    expect(r.mfaRequired).toBe(true); expect(r.mfaToken).toBeDefined();
    expect(r.accessToken).toBeUndefined(); expect(r.refreshToken).toBeUndefined();
  });
  it('staff senza MFA configurata: solo token di enrollment, niente accesso', async () => {
    const { svc, db, mkUser } = await setup(); const u = await mkUser({ accountType: 'staff' });
    await db.adminAccount.create({ data: { userId: u.id, status: 'active', mfaRequired: true } });
    const r: any = await login(svc);
    expect(r.mfaEnrollmentRequired).toBe(true); expect(r.enrollToken).toBeDefined(); expect(r.accessToken).toBeUndefined();
  });
});

describe('MFA: configurazione e login completo (staff)', () => {
  async function staffEnroll() {
    const s = await setup();
    const u = await s.mkUser({ accountType: 'staff' });
    await s.db.adminAccount.create({ data: { userId: u.id, status: 'active', mfaRequired: true } });
    const first: any = await login(s.svc);
    const caller = await s.svc.userFromBearer(`Bearer ${first.enrollToken}`, ['access', 'mfa_enroll']);
    const setup1 = await s.svc.mfaSetup(caller.id);
    return { ...s, u, first, caller, secret: setup1.secret, uri: setup1.otpauthUri };
  }
  const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
  let now: jest.SpyInstance;
  beforeEach(() => { now = jest.spyOn(Date, 'now').mockReturnValue(T0); });
  afterEach(() => now.mockRestore());

  it('il token di enrollment NON è un access token e il token MFA non apre gli endpoint di setup', async () => {
    const { svc, first, mkUser } = await staffEnroll();
    await expect(svc.userFromBearer(`Bearer ${first.enrollToken}`, ['access'])).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.userFromBearer('Bearer abc.def.ghi', ['access'])).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.userFromBearer(undefined, ['access'])).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('setup: segreto salvato CIFRATO, legato all\'utente; URI otpauth corretto', async () => {
    const { db, u, secret, uri } = await staffEnroll();
    const stored = db.user.rows.find((r: any) => r.id === u.id).mfaSecret;
    expect(stored).not.toContain(secret); expect(decryptSecret(stored, parseKey(KEY_B64), u.id)).toBe(secret);
    expect(uri).toContain(`secret=${secret}`);
  });
  it('enable con codice sbagliato rifiutato; con codice giusto: 10 codici di recupero + sessione completa', async () => {
    const { svc, db, caller, secret, codeAt } = await staffEnroll();
    await expect(svc.mfaEnable(caller, '000000')).rejects.toBeInstanceOf(BadRequestException);
    const r: any = await svc.mfaEnable(caller, codeAt(secret, T0));
    expect(r.recoveryCodes).toHaveLength(10); expect(r.recoveryCodes[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{8}$/);
    expect(r.accessToken).toBeDefined(); expect(r.refreshToken).toBeDefined();
    expect(db.mfaRecoveryCode.rows.every((c: any) => !r.recoveryCodes.includes(c.codeHash))).toBe(true); // solo hash nel DB
    expect(db.user.rows[0].mfaEnabled).toBe(true);
  });
  it('login con MFA: codice valido ok; STESSO codice riusato = replay rifiutato; codice successivo ok', async () => {
    const s = await staffEnroll();
    await s.svc.mfaEnable(s.caller, s.codeAt(s.secret, T0));
    const l1: any = await login(s.svc);
    expect(l1.mfaRequired).toBe(true);
    // il codice dell'intervallo T0 è già stato usato per l'enable: replay
    await expect(s.svc.mfaVerify(l1.mfaToken, { code: s.codeAt(s.secret, T0) })).rejects.toBeInstanceOf(UnauthorizedException);
    now.mockReturnValue(T0 + 30_000);
    const ok: any = await s.svc.mfaVerify(l1.mfaToken, { code: s.codeAt(s.secret, T0 + 30_000) });
    expect(ok.accessToken).toBeDefined(); expect(ok.refreshToken).toBeDefined();
    const l2: any = await login(s.svc);
    await expect(s.svc.mfaVerify(l2.mfaToken, { code: s.codeAt(s.secret, T0 + 30_000) })).rejects.toBeInstanceOf(UnauthorizedException); // replay
  });
  it('lockout: 5 codici errati bloccano anche il codice giusto per 15 minuti (persistente, vale tra IP diversi)', async () => {
    const s = await staffEnroll();
    await s.svc.mfaEnable(s.caller, s.codeAt(s.secret, T0));
    const l: any = await login(s.svc);
    now.mockReturnValue(T0 + 30_000);
    for (let i = 0; i < 5; i++) await expect(s.svc.mfaVerify(l.mfaToken, { code: '111111' })).rejects.toBeInstanceOf(UnauthorizedException);
    const locked: any = await s.svc.mfaVerify(l.mfaToken, { code: s.codeAt(s.secret, T0 + 30_000) }).catch((e) => e);
    expect(locked).toBeInstanceOf(HttpException); expect(locked.getStatus()).toBe(429);
    now.mockReturnValue(T0 + 30_000 + 16 * 60_000);
    const l2: any = await login(s.svc);
    const ok: any = await s.svc.mfaVerify(l2.mfaToken, { code: s.codeAt(s.secret, T0 + 30_000 + 16 * 60_000) });
    expect(ok.accessToken).toBeDefined();
  });
  it('codice di recupero: funziona UNA volta', async () => {
    const s = await staffEnroll();
    const en: any = await s.svc.mfaEnable(s.caller, s.codeAt(s.secret, T0));
    const rc = en.recoveryCodes[3];
    const l1: any = await login(s.svc);
    const ok: any = await s.svc.mfaVerify(l1.mfaToken, { recoveryCode: rc });
    expect(ok.accessToken).toBeDefined();
    const l2: any = await login(s.svc);
    await expect(s.svc.mfaVerify(l2.mfaToken, { recoveryCode: rc })).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('token MFA scaduto/falso rifiutato', async () => {
    const s = await staffEnroll();
    await expect(s.svc.mfaVerify('non.un.token', { code: '123456' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(s.svc.mfaVerify('x', {})).rejects.toBeInstanceOf(BadRequestException);
  });
  it('disattivazione: vietata allo staff con MFA obbligatoria', async () => {
    const s = await staffEnroll();
    await s.svc.mfaEnable(s.caller, s.codeAt(s.secret, T0));
    now.mockReturnValue(T0 + 30_000);
    await expect(s.svc.mfaDisable(s.u.id, PW, s.codeAt(s.secret, T0 + 30_000))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('disattivazione utente normale: servono password E codice; poi MFA azzerata e sessioni chiuse', async () => {
    const s = await setup(); const u = await s.mkUser();
    const { secret } = await s.mfa.setup(u.id); await s.mfa.enable(u.id, s.codeAt(secret, T0));
    now.mockReturnValue(T0 + 30_000);
    await expect(s.svc.mfaDisable(u.id, 'sbagliata-123', s.codeAt(secret, T0 + 30_000))).rejects.toBeInstanceOf(UnauthorizedException);
    now.mockReturnValue(T0 + 60_000);
    await expect(s.svc.mfaDisable(u.id, PW, s.codeAt(secret, T0 + 60_000))).resolves.toEqual({ ok: true });
    expect(s.db.user.rows[0]).toMatchObject({ mfaEnabled: false, mfaSecret: null });
    expect(s.db.mfaRecoveryCode.rows).toHaveLength(0);
  });
  it('reset da Super Admin: azzera MFA, recovery code e sessioni', async () => {
    const s = await staffEnroll();
    await s.svc.mfaEnable(s.caller, s.codeAt(s.secret, T0));
    await s.mfa.resetMfa(s.u.id);
    expect(s.db.user.rows[0]).toMatchObject({ mfaEnabled: false, mfaSecret: null });
    expect(s.db.refreshToken.rows.every((t: any) => t.revokedAt)).toBe(true);
    const again: any = await login(s.svc);
    expect(again.mfaEnrollmentRequired).toBe(true); // deve riconfigurare
  });
});

describe('password dimenticata e invito staff', () => {
  it('forgot-password: stessa risposta per email esistente e inesistente; mail solo se esiste', async () => {
    const s = await setup(); await s.mkUser();
    const a = await s.svc.forgotPassword('a@b.it'); const b = await s.svc.forgotPassword('nessuno@b.it');
    expect(a).toEqual(b); expect(s.mail.sent).toHaveLength(1);
    expect(s.mail.sent[0].text).toContain('https://aura.test/set-password#token=');
  });
  it('reset: nuova password, sessioni chiuse; la vecchia non vale più; token monouso', async () => {
    const s = await setup(); await s.mkUser();
    const l: any = await login(s.svc);
    await s.svc.forgotPassword('a@b.it'); const token = tokenFrom(s.mail.sent[0].text);
    const NEW = 'Nuova-Password-77!x';
    await expect(s.svc.setPassword(token, NEW)).resolves.toEqual({ ok: true });
    expect(s.db.refreshToken.rows.every((t: any) => t.revokedAt)).toBe(true);
    await expect(login(s.svc, 'a@b.it', PW)).rejects.toThrow('Credenziali non valide.');
    expect((await login(s.svc, 'a@b.it', NEW) as any).accessToken).toBeDefined();
    await expect(s.svc.setPassword(token, 'Altra-Password-88!y')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('password debole NON brucia il link', async () => {
    const s = await setup(); await s.mkUser();
    await s.svc.forgotPassword('a@b.it'); const token = tokenFrom(s.mail.sent[0].text);
    await expect(s.svc.setPassword(token, 'password123')).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.setPassword(token, 'Nuova-Password-77!x')).resolves.toEqual({ ok: true });
  });
  it('il reset password NON salta l\'MFA', async () => {
    const s = await setup(); const u = await s.mkUser({ mfaEnabled: true, mfaSecret: 'x' });
    await s.svc.forgotPassword('a@b.it');
    await s.svc.setPassword(tokenFrom(s.mail.sent[0].text), 'Nuova-Password-77!x');
    const r: any = await login(s.svc, 'a@b.it', 'Nuova-Password-77!x');
    expect(r.mfaRequired).toBe(true); expect(r.accessToken).toBeUndefined();
  });
  it('invito staff: imposta la password dal link, diventa attivo/verificato, poi deve configurare MFA', async () => {
    const s = await setup();
    const u = await s.db.user.create({ data: { email: 's@b.it', accountType: 'staff', status: 'pending_verification', passwordHash: null } });
    await s.db.adminAccount.create({ data: { userId: u.id, status: 'active', mfaRequired: true } });
    await expect(login(s.svc, 's@b.it', PW)).rejects.toThrow('Credenziali non valide.'); // senza password non entra
    const token = await s.emailTokens.create(u.id, 'staff_invite');
    await s.svc.setPassword(token, PW);
    expect(s.db.user.rows[0]).toMatchObject({ status: 'active', emailVerified: true });
    const r: any = await login(s.svc, 's@b.it');
    expect(r.mfaEnrollmentRequired).toBe(true);
  });
});

describe('refresh, logout, me', () => {
  it('refresh: ruota il token; il vecchio non vale più', async () => {
    const { svc, db, mkUser } = await setup(); await mkUser();
    const first: any = await login(svc); const second: any = await svc.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken); expect(second.refreshId).toBeUndefined();
    expect(db.refreshToken.rows[0].revokedAt).not.toBeNull(); expect(db.refreshToken.rows[0].replacedById).toBe(db.refreshToken.rows[1].id);
  });
  it('refresh: il riuso di un token revocato chiude TUTTE le sessioni e viene tracciato', async () => {
    const { svc, db, mkUser } = await setup(); await mkUser();
    const first: any = await login(svc); const second: any = await svc.refresh(first.refreshToken);
    await expect(svc.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.refreshToken.rows.every((t: any) => t.revokedAt !== null)).toBe(true);
    await expect(svc.refresh(second.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.auditLog.rows.some((a: any) => a.action === 'auth.refresh_reuse_detected')).toBe(true);
  });
  it('logout: revoca anche senza access token; token sconosciuto = stessa risposta', async () => {
    const { svc, mkUser } = await setup(); await mkUser();
    const first: any = await login(svc);
    await expect(svc.logout(first.refreshToken)).resolves.toEqual({ ok: true });
    await expect(svc.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.logout('x'.repeat(40))).resolves.toEqual({ ok: true });
  });
  it('me: utente e permessi, senza campi sensibili; sospeso -> 401', async () => {
    const { svc, db, mkUser } = await setup(); const u = await mkUser();
    const r: any = await svc.me(u.id);
    expect(r.permissions).toEqual(['users.read']); expect(r.user.passwordHash).toBeUndefined(); expect(r.user.mfaSecret).toBeUndefined();
    db.user.rows[0].status = 'suspended';
    await expect(svc.me(u.id)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
