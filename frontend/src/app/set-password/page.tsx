'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiPublic } from '@/lib/api';

// Serve sia per "password dimenticata" sia per il primo accesso dello staff invitato.
export default function SetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get('token');
    history.replaceState(null, '', window.location.pathname); // il token resta solo in memoria
    setToken(t ?? '');
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Le due password non coincidono.'); return; }
    setError(''); setBusy(true);
    try { await apiPublic('set-password', { token: token!, password }); setDone(true); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (token === null) return <div className="min-h-screen flex items-center justify-center text-aura-mute">Caricamento…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-aura-text text-center mb-6">Scegli la tua password</h1>
        {done ? (
          <div className="card text-center space-y-3"><p className="text-aura-mute text-sm">Password impostata. Ora puoi accedere.</p><Link href="/login" className="btn-primary inline-block">Accedi</Link></div>
        ) : !token ? (
          <div className="card text-center space-y-3"><p className="text-aura-mute text-sm">Link non valido.</p><Link href="/forgot-password" className="btn-ghost inline-block">Richiedi un nuovo link</Link></div>
        ) : (
          <form onSubmit={submit} className="card space-y-4">
            <div>
              <label className="label" htmlFor="pw">Nuova password</label>
              <input id="pw" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} maxLength={128} autoFocus />
              <p className="text-xs text-aura-dim mt-1">Almeno 10 caratteri con 3 tipi di caratteri, oppure una frase lunga di 14+ caratteri.</p>
            </div>
            <div>
              <label className="label" htmlFor="pw2">Ripeti la password</label>
              <input id="pw2" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required maxLength={128} />
            </div>
            {error && <div role="alert" className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-xl px-3 py-2">{error}</div>}
            <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Salvataggio…' : 'Imposta password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
