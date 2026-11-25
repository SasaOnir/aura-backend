'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, DemoRole } from '@/lib/auth-context';
import { BackendUnavailableError } from '@/lib/api';

export default function LoginPage() {
  const { login, loginDemo } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreds, setShowCreds] = useState(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      // Distingui "backend non disponibile" da "credenziali errate":
      // - BackendUnavailableError → messaggio specifico + suggerimento modalità demo
      // - altri errori (HTTP 401 dal backend) → "credenziali non valide"
      if (err instanceof BackendUnavailableError) {
        setError(err.message + ' Puoi comunque esplorare il pannello in modalità demo qui sotto.');
      } else {
        setError(err.message || 'Login fallito.');
      }
    } finally {
      setLoading(false);
    }
  };

  const enterDemo = (role: DemoRole) => {
    setError('');
    loginDemo(role);
    router.push('/');
  };

  const fillCreds = (role: DemoRole) => {
    if (role === 'super_admin') {
      setEmail('sasacaruso84@gmail.com');
      setPassword('Aura-Demo-2026!');
    } else {
      setEmail('collaboratore@aura.local');
      setPassword('Aura-Demo-2026!');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Aurora di sfondo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-aura-accent/20 blur-3xl" />
        <div className="absolute top-20 -right-40 w-96 h-96 rounded-full bg-aura-violet/20 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 rounded-full bg-aura-teal/10 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-aura-accent via-aura-violet to-aura-teal mb-4 shadow-lg shadow-aura-violet/30" />
          <h1 className="text-3xl font-bold text-aura-text tracking-tight">Aura Control</h1>
          <p className="text-aura-mute text-sm mt-1.5">Pannello di amministrazione della piattaforma musicale Aura</p>
        </div>

        {/* Form login */}
        <form onSubmit={submit} className="card space-y-4 backdrop-blur-sm bg-aura-card/80">
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

        {/* Pannello credenziali demo */}
        <div className="card mt-4 backdrop-blur-sm bg-aura-card/80">
          <button
            onClick={() => setShowCreds(!showCreds)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <div className="text-sm font-semibold text-aura-text flex items-center gap-2">
                <span className="text-base">🎭</span> Credenziali dimostrative
              </div>
              <div className="text-xs text-aura-mute mt-0.5">
                Il backend non è ancora online — esplora il pannello in modalità demo
              </div>
            </div>
            <span className="text-aura-dim text-lg">{showCreds ? '▾' : '▸'}</span>
          </button>

          {showCreds && (
            <div className="mt-4 space-y-3">
              {/* Super Admin */}
              <div className="rounded-xl border border-aura-gold/30 bg-aura-gold/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-aura-gold uppercase tracking-wider">
                    👑 Super Admin
                  </span>
                  <button
                    onClick={() => fillCreds('super_admin')}
                    className="text-[11px] text-aura-violet hover:text-aura-accent transition"
                  >
                    compila campi ↑
                  </button>
                </div>
                <div className="font-mono text-xs text-aura-text space-y-0.5">
                  <div><span className="text-aura-dim">email: </span>sasacaruso84@gmail.com</div>
                  <div><span className="text-aura-dim">pass:  </span>Aura-Demo-2026!</div>
                </div>
                <button
                  onClick={() => enterDemo('super_admin')}
                  className="btn-primary w-full mt-2.5 text-xs"
                >
                  Entra come Super Admin →
                </button>
              </div>

              {/* Collaboratore */}
              <div className="rounded-xl border border-aura-teal/30 bg-aura-teal/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-aura-teal uppercase tracking-wider">
                    🛡️ Collaboratore
                  </span>
                  <button
                    onClick={() => fillCreds('staff')}
                    className="text-[11px] text-aura-violet hover:text-aura-accent transition"
                  >
                    compila campi ↑
                  </button>
                </div>
                <div className="font-mono text-xs text-aura-text space-y-0.5">
                  <div><span className="text-aura-dim">email: </span>collaboratore@aura.local</div>
                  <div><span className="text-aura-dim">pass:  </span>Aura-Demo-2026!</div>
                </div>
                <button
                  onClick={() => enterDemo('staff')}
                  className="btn-ghost w-full mt-2.5 text-xs"
                >
                  Entra come Collaboratore →
                </button>
              </div>

              <p className="text-[11px] text-aura-dim text-center pt-1">
                ⚠️ Dati fittizi per navigazione. Nessuna operazione viene eseguita né simulata come riuscita.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-aura-dim text-xs mt-6 leading-relaxed">
          Accesso riservato al Super Admin e collaboratori autorizzati.
          <br />Tutte le azioni sono registrate nell'audit log (PRD §4.6).
        </p>
      </div>
    </div>
  );
}
