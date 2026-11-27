'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = await login(email, password);
      router.push(u.accountType === 'staff' ? '/' : '/account');
    } catch (err: any) {
      setError(err.message || 'Accesso non riuscito.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-aura-accent via-aura-violet to-aura-teal mb-4" />
          <h1 className="text-2xl font-bold text-aura-text">Accedi ad Aura</h1>
          <p className="text-aura-mute text-sm mt-1">La piattaforma per artisti di musica generata con AI</p>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus maxLength={254} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" className="input" value={password}
              onChange={(e) => setPassword(e.target.value)} required maxLength={128} />
          </div>
          {error && (
            <div role="alert" className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-xl px-3 py-2">{error}</div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Accesso…' : 'Accedi'}</button>
        </form>

        <p className="text-center text-aura-mute text-sm mt-6">
          Non hai un account? <Link href="/register" className="text-aura-accent hover:underline">Registrati</Link>
        </p>
      </div>
    </div>
  );
}
