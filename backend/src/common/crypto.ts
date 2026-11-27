import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/** Chiave AES-256 da base64 (openssl rand -base64 32). Rifiuta chiavi di lunghezza sbagliata. */
export function parseKey(b64: string): Buffer {
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new Error('MFA_ENCRYPTION_KEY deve essere 32 byte in base64 (openssl rand -base64 32).');
  return k;
}

/**
 * AES-256-GCM. L'AAD (qui: l'id utente) lega il ciphertext al suo proprietario: copiare il segreto
 * di un utente nella riga di un altro non produce un segreto valido.
 * Formato: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
export function encryptSecret(plain: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(blob: string, key: Buffer, aad: string): string {
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Formato segreto non valido.');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
