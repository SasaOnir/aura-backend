import { base32Decode, base32Encode, hotp, verifyTotp, generateSecret, otpauthUri } from './totp';
import { decryptSecret, encryptSecret, parseKey } from '../common/crypto';
import { randomBytes } from 'crypto';

const RFC_SECRET = Buffer.from('12345678901234567890'); // segreto di test dell'RFC 4226/6238

describe('HOTP — vettori ufficiali RFC 4226 (appendice D)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  it.each(expected.map((c, i) => [i, c]))('contatore %i -> %s', (i, code) => {
    expect(hotp(RFC_SECRET, i as number)).toBe(code);
  });
});

describe('TOTP — vettori RFC 6238 (SHA-1, ultime 6 cifre degli 8 ufficiali)', () => {
  const secret = base32Encode(RFC_SECRET);
  it.each([[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']])(
    'T=%i -> %s', (t, code) => expect(verifyTotp(secret, code as string, (t as number) * 1000, 0)).not.toBeNull());
  it('accetta ±1 intervallo e rifiuta oltre', () => {
    expect(verifyTotp(secret, '287082', 59_000 + 30_000, 1)).not.toBeNull();
    expect(verifyTotp(secret, '287082', 59_000 + 90_000, 1)).toBeNull();
  });
  it('rifiuta formati non validi', () => {
    for (const bad of ['12345', '1234567', 'abcdef', '', '28708 ']) expect(verifyTotp(secret, bad, 59_000)).toBeNull();
  });
  it('restituisce l\'intervallo combaciato (per l\'anti-replay)', () => {
    expect(verifyTotp(secret, '287082', 59_000, 0)).toBe(1);
  });
});

describe('base32 e segreti', () => {
  it('round-trip', () => { const b = randomBytes(20); expect(base32Decode(base32Encode(b)).equals(b)).toBe(true); });
  it('segreto generato: 32 caratteri base32 (160 bit), diverso a ogni chiamata', () => {
    const a = generateSecret(), b = generateSecret(); expect(a).toMatch(/^[A-Z2-7]{32}$/); expect(a).not.toBe(b);
  });
  it('otpauth URI completo', () => {
    const u = otpauthUri('Aura', 'a@b.it', 'ABC'); expect(u).toContain('otpauth://totp/Aura%3Aa%40b.it?secret=ABC'); expect(u).toContain('issuer=Aura');
  });
});

describe('cifratura segreto a riposo (AES-256-GCM)', () => {
  const key = parseKey(randomBytes(32).toString('base64'));
  it('round-trip e cifratura non deterministica', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP', key, 'user-1'), b = encryptSecret('JBSWY3DPEHPK3PXP', key, 'user-1');
    expect(a).not.toBe(b); expect(a).not.toContain('JBSWY3DP'); expect(decryptSecret(a, key, 'user-1')).toBe('JBSWY3DPEHPK3PXP');
  });
  it('legato all\'utente: il ciphertext di un utente non si decifra con l\'id di un altro', () => {
    expect(() => decryptSecret(encryptSecret('S', key, 'user-1'), key, 'user-2')).toThrow();
  });
  it('rileva manomissioni e chiavi sbagliate', () => {
    const c = encryptSecret('S', key, 'u'); const p = c.split('.'); p[3] = Buffer.from('xxxxxxxx').toString('base64url');
    expect(() => decryptSecret(p.join('.'), key, 'u')).toThrow();
    expect(() => decryptSecret(c, parseKey(randomBytes(32).toString('base64')), 'u')).toThrow();
  });
  it('rifiuta chiavi di lunghezza sbagliata', () => { expect(() => parseKey(Buffer.from('corta').toString('base64'))).toThrow(); });
});
