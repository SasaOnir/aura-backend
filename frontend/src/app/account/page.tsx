'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiLogoutAll, apiMfaEnable, apiMfaDisable } from '@/lib/api';
import MfaEnroll from '@/components/MfaEnroll';

const TYPE_LABEL: Record<string, string> = { artist: 'Artista', listener: 'Ascoltatore', label: 'Etichetta', staff: 'Staff' };

export default function AccountPage() {
  const { user, loading, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [mfaMode, setMfaMode] = useState<'idle' | 'enroll' | 'disable'>('idle');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center text-aura-mute">Caricamento…</div>;

  const out = async () => { await logout(); router.push('/login'); };
  const outAll = async () => {
    try { await apiLogoutAll(); await logout(); router.push('/login'); }
    catch (e: any) { setMsg(e.message || 'Operazione non riuscita.'); }
  };

  const disableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    try { await apiMfaDisable(pw, code); setPw(''); setCode(''); setMfaMode('idle'); await refreshUser(); }
    catch (err: any) { setMsg(err.message || 'Operazione non riuscita.'); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4">
        <div className="card">
          <div className="text-xs uppercase tracking-wider text-aura-dim">{TYPE_LABEL[user.accountType] ?? user.accountType}</div>
          <h1 className="text-2xl font-bold text-aura-text mt-1">Ciao, {user.displayName}</h1>
          <p className="text-aura-mute text-sm mt-1">{user.email}</p>
        </div>

        <div className="card">
          <h2 className="font-semibold text-aura-text">Il tuo spazio su Aura</h2>
          <p className="text-aura-mute text-sm mt-2">
            Il tuo account è attivo. Il caricamento dei brani, il profilo artista pubblico e le collaborazioni sono in arrivo:
            li stiamo costruendo con la sicurezza e le tutele sul diritto d'autore al centro.
          </p>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-aura-text">Autenticazione a due fattori</h2>
            <span className={`text-xs px-2 py-1 rounded-full ${user.mfaEnabled ? 'bg-aura-teal/20 text-aura-teal' : 'bg-aura-gold/20 text-aura-gold'}`}>{user.mfaEnabled ? 'Attiva' : 'Non attiva'}</span>
          </div>
          {mfaMode === 'idle' && !user.mfaEnabled && (
            <>
              <p className="text-sm text-aura-mute">Proteggi il tuo account: oltre alla password serve un codice dalla tua app di autenticazione.</p>
              <button className="btn-primary" onClick={() => setMfaMode('enroll')}>Attiva</button>
            </>
          )}
          {mfaMode === 'enroll' && (
            <MfaEnroll
              onConfirm={async (c) => (await apiMfaEnable(c)).recoveryCodes}
              onDone={async () => { setMfaMode('idle'); await refreshUser(); }}
              onCancel={() => setMfaMode('idle')}
            />
          )}
          {mfaMode === 'idle' && user.mfaEnabled && (
            <button className="btn-ghost" onClick={() => setMfaMode('disable')}>Disattiva…</button>
          )}
          {mfaMode === 'disable' && (
            <form onSubmit={disableMfa} className="space-y-3">
              <p className="text-sm text-aura-mute">Per disattivarla servono la password e un codice dell'app.</p>
              <input className="input" type="password" autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} required maxLength={128} />
              <input className="input tracking-widest" inputMode="numeric" autoComplete="one-time-code" placeholder="Codice a 6 cifre" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
              <div className="flex gap-3">
                <button type="button" className="btn-ghost flex-1" onClick={() => setMfaMode('idle')}>Annulla</button>
                <button type="submit" className="btn-primary flex-1">Disattiva</button>
              </div>
            </form>
          )}
        </div>

        {user.emailVerified === false && (
          <div className="card text-sm text-aura-gold border-aura-gold/40">Email non ancora verificata (la verifica sarà richiesta per pubblicare).</div>
        )}
        {msg && <div role="alert" className="card text-sm text-red-300">{msg}</div>}

        <div className="flex gap-3">
          <button onClick={out} className="btn-ghost flex-1">Esci</button>
          <button onClick={outAll} className="btn-ghost flex-1">Esci da tutti i dispositivi</button>
        </div>
      </div>
    </div>
  );
}
