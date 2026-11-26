import { checkPasswordPolicy } from './password-policy';
import { needsRehash } from './argon2-params';
import { clientIp } from './client-ip';

describe('checkPasswordPolicy', () => {
  it.each([
    ['corta', 'Ab1!xyz'],
    ['comune', 'password123'],
    ['ripetuta', 'aaaaaaaaaaaa'],
  ])('rifiuta password %s', (_n, pw) => expect(checkPasswordPolicy(pw)).not.toBeNull());
  it('rifiuta password che contiene la propria email', () => {
    expect(checkPasswordPolicy('mario.rossi-2026!', { email: 'mario.rossi@mail.it' })).not.toBeNull();
  });
  it('accetta password robusta e passphrase lunga', () => {
    expect(checkPasswordPolicy('T7#kq9Lm!2vX')).toBeNull();
    expect(checkPasswordPolicy('cavallo batteria graffetta nuvola')).toBeNull();
  });
});

describe('needsRehash', () => {
  const want = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
  it('false se i parametri sono uguali o più forti', () => {
    expect(needsRehash('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA', want)).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$aGFzaA', want)).toBe(false);
  });
  it('true se più deboli o non argon2id', () => {
    expect(needsRehash('$argon2id$v=19$m=4096,t=2,p=1$c2FsdA$aGFzaA', want)).toBe(true);
    expect(needsRehash('$2b$10$abcdefghijklmnopqrstuv', want)).toBe(true);
  });
});

describe('clientIp', () => {
  it('ignora x-forwarded-for del client e valida il formato', () => {
    expect(clientIp({ ip: '::ffff:203.0.113.9', headers: { 'x-forwarded-for': 'evil' } } as any)).toBe('203.0.113.9');
    expect(clientIp({ ip: 'non-un-ip', headers: {} } as any)).toBeUndefined();
  });
});
