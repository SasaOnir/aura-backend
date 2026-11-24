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
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Login fallito.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-aura-accent via-aura-violet to-aura-teal mb-4" />
          <h1 className="text-2xl font-bold text-aura-text">Aura Control</h1>
          <p className="text-aura-mute text-sm mt-1">Accedi al pannello di amministrazione</p>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@aura.example"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && (
            <div className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-xl px-3 py-2">
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Accesso…' : 'Accedi'}
          </button>
        </form>

        <p className="text-center text-aura-dim text-xs mt-6">
          ⚠️ Accesso riservato al Super Admin e collaboratori autorizzati.
          <br />Tutte le azioni sono registrate nell'audit log (PRD §4.6).
        </p>
      </div>
    </div>
  );
}
