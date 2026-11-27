'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

type Kind = 'artist' | 'listener' | 'label';
const KINDS: { v: Kind; label: string; hint: string }[] = [
  { v: 'artist', label: 'Artista', hint: 'Carica e pubblica la tua musica' },
  { v: 'listener', label: 'Ascoltatore', hint: 'Scopri e segui gli artisti' },
  { v: 'label', label: 'Etichetta', hint: 'Gestisci un roster di artisti' },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', displayName: '', accountType: 'artist' as Kind });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.email, form.password, form.displayName, form.accountType);
      router.push('/account');
    } catch (err: any) {
      setError(err.message || 'Registrazione non riuscita.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-aura-accent via-aura-violet to-aura-teal mb-4" />
          <h1 className="text-2xl font-bold text-aura-text">Crea il tuo account Aura</h1>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <fieldset>
            <legend className="label">Chi sei?</legend>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => (
                <label key={k.v} className={`cursor-pointer rounded-xl border px-2 py-2 text-center text-sm ${form.accountType === k.v ? 'border-aura-accent bg-aura-deep text-aura-text' : 'border-aura-line text-aura-mute'}`}>
                  <input type="radio" name="kind" className="sr-only" checked={form.accountType === k.v} onChange={() => set('accountType', k.v)} />
                  {k.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-aura-dim mt-2">{KINDS.find((k) => k.v === form.accountType)?.hint}</p>
          </fieldset>
          <div>
            <label className="label" htmlFor="name">Nome / nome d'arte</label>
            <input id="name" className="input" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} required minLength={2} maxLength={80} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} required maxLength={254} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" className="input" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={10} maxLength={128} />
            <p className="text-xs text-aura-dim mt-1">Almeno 10 caratteri con 3 tipi di caratteri, oppure una frase lunga di 14+ caratteri.</p>
          </div>
          {error && <div role="alert" className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-xl px-3 py-2">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Creazione…' : 'Crea account'}</button>
        </form>

        <p className="text-center text-aura-mute text-sm mt-6">
          Hai già un account? <Link href="/login" className="text-aura-accent hover:underline">Accedi</Link>
        </p>
      </div>
    </div>
  );
}
