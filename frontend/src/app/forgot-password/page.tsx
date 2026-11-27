'use client';
import { useState } from 'react';
import Link from 'next/link';
import { apiPublic } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { setDone((await apiPublic('forgot-password', { email })) || 'Richiesta inviata.'); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-aura-text text-center mb-6">Password dimenticata</h1>
        {done ? (
          <div className="card text-center space-y-3"><p className="text-aura-mute text-sm">{done}</p><Link href="/login" className="btn-ghost inline-block">Torna al login</Link></div>
        ) : (
          <form onSubmit={submit} className="card space-y-4">
            <p className="text-sm text-aura-mute">Inserisci la tua email: se è registrata, ti invieremo un link per scegliere una nuova password.</p>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoFocus />
            </div>
            {error && <div role="alert" className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-xl px-3 py-2">{error}</div>}
            <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Invio…' : 'Invia link'}</button>
            <div className="text-center"><Link href="/login" className="text-sm text-aura-mute hover:underline">Indietro</Link></div>
          </form>
        )}
      </div>
    </div>
  );
}
