'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiPublic, ApiError } from '@/lib/api';
import MfaEnroll from '@/components/MfaEnroll';

type Step = { s: 'credentials' } | { s: 'mfa'; token: string } | { s: 'enroll'; token: string };

export default function LoginPage() {
  const { login, verifyMfa, enrollMfa } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ s: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [notVerified, setNotVerified] = useState(false);
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [afterEnroll, setAfterEnroll] = useState<string | null>(null);

  const go = (accountType: string) => router.push(accountType === 'staff' ? '/' : '/account');

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo(''); setNotVerified(false); setLoading(true);
    try {
      const r = await login(email, password);
      if (r.kind === 'session') go(r.user.accountType);
      else if (r.kind === 'mfa') { setStep({ s: 'mfa', token: r.mfaToken }); setPassword(''); }
      else setStep({ s: 'enroll', token: r.enrollToken });
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') setNotVerified(true);
      setError(err.message || 'Accesso non riuscito.');
    } finally { setLoading(false); }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.s !== 'mfa') return;
    setError(''); setLoading(true);
    try {
      const u = await verifyMfa(step.token, useRecovery ? { recoveryCode: code.trim().toLowerCase() } : { code: code.trim() });
      go(u.accountType);
    } catch (err: any) {
      setError(err.message || 'Codice non valido.');
      if (err instanceof ApiError && err.status === 401 && /sessione/i.test(err.message)) setStep({ s: 'credentials' }); // token MFA scaduto
    } finally { setLoading(false); }
  };

  const resend = async () => {
    setError(''); setInfo('');
    try { setInfo((await apiPublic('resend-verification', { email })) || 'Email inviata.'); setNotVerified(false); }
    catch (err: any) { setError(err.message); }
  };

  const header = (title: string, sub?: string) => (
    <div className="text-center mb-8">
      <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-aura-accent via-aura-violet to-aura-teal mb-4" />
      <h1 className="text-2xl font-bold text-aura-text">{title}</h1>
      {sub && <p className="text-aura-mute text-sm mt-1">{sub}</p>}
    </div>
  );
  const alert = error && <div role="alert" className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-xl px-3 py-2">{error}</div>;

  if (step.s === 'enroll') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {header('Configura la sicurezza del tuo account', 'Per gli account staff l\'autenticazione a due fattori è obbligatoria.')}
          <div className="card">
            <MfaEnroll
              enrollToken={step.token}
              onConfirm={async (c) => { const r = await enrollMfa(step.token, c); setAfterEnroll(r.user.accountType); return r.recoveryCodes; }}
              onDone={() => go(afterEnroll || 'staff')}
            />
          </div>
        </div>
      </div>
    );
  }

  if (step.s === 'mfa') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {header('Verifica in due passaggi', useRecovery ? 'Inserisci uno dei tuoi codici di recupero.' : 'Inserisci il codice a 6 cifre della tua app di autenticazione.')}
          <form onSubmit={submitMfa} className="card space-y-4">
            <div>
              <label className="label" htmlFor="code">{useRecovery ? 'Codice di recupero' : 'Codice a 6 cifre'}</label>
              {useRecovery
                ? <input id="code" className="input font-mono" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxxxxxx-xxxxxxxx" maxLength={17} required autoFocus />
                : <input id="code" className="input tracking-widest" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />}
            </div>
            {alert}
            <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Verifica…' : 'Verifica'}</button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-aura-accent hover:underline" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }}>
                {useRecovery ? 'Usa l\'app di autenticazione' : 'Ho perso il telefono'}
              </button>
              <button type="button" className="text-aura-mute hover:underline" onClick={() => { setStep({ s: 'credentials' }); setCode(''); setError(''); }}>Indietro</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {header('Accedi ad Aura', 'La piattaforma per artisti di musica generata con AI')}
        <form onSubmit={submitCredentials} className="card space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus maxLength={254} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={128} />
          </div>
          {alert}
          {notVerified && <button type="button" className="text-sm text-aura-accent hover:underline" onClick={resend}>Reinvia l'email di verifica</button>}
          {info && <div role="status" className="text-sm text-aura-teal">{info}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Accesso…' : 'Accedi'}</button>
          <div className="text-right"><Link href="/forgot-password" className="text-sm text-aura-mute hover:underline">Password dimenticata?</Link></div>
        </form>
        <p className="text-center text-aura-mute text-sm mt-6">
          Non hai un account? <Link href="/register" className="text-aura-accent hover:underline">Registrati</Link>
        </p>
      </div>
    </div>
  );
}
