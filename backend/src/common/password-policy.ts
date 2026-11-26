const COMMON = new Set([
  'password', 'password1', 'password123', '123456789', '1234567890', 'qwertyuiop', 'iloveyou1',
  'passw0rd123', 'letmein123', 'admin12345', 'welcome123', 'aura12345', 'musica12345', 'napoli1234',
]);

/** Ritorna un messaggio d'errore, oppure null se la password è accettabile. */
export function checkPasswordPolicy(pw: string, ctx: { email?: string; displayName?: string } = {}): string | null {
  if (pw.length < 10) return 'La password deve avere almeno 10 caratteri.';
  if (pw.length > 128) return 'La password è troppo lunga (max 128).';
  const low = pw.toLowerCase();
  if (COMMON.has(low)) return 'Password troppo comune.';
  if (/^(.)\1+$/.test(pw)) return 'Password troppo banale.';
  const local = ctx.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && low.includes(local)) return 'La password non deve contenere la tua email.';
  const name = ctx.displayName?.toLowerCase().replace(/\s+/g, '');
  if (name && name.length >= 4 && low.replace(/\s+/g, '').includes(name)) return 'La password non deve contenere il tuo nome.';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length < 14 && classes < 3) return 'Usa almeno 3 tipi di caratteri (minuscole, maiuscole, numeri, simboli) oppure una passphrase di 14+ caratteri.';
  return null;
}
