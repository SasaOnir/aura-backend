/**
 * @node-rs/argon2 non espone needRehash: si leggono i parametri dalla stringa PHC
 * ($argon2id$v=19$m=19456,t=2,p=1$salt$hash) e si confrontano con quelli attuali.
 */
export function needsRehash(phc: string, want: { memoryCost: number; timeCost: number; parallelism: number }): boolean {
  const m = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(phc);
  if (!m) return true; // non è argon2id: rigenera
  return Number(m[1]) < want.memoryCost || Number(m[2]) < want.timeCost || Number(m[3]) < want.parallelism;
}
