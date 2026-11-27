'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiLogoutAll } from '@/lib/api';

const TYPE_LABEL: Record<string, string> = { artist: 'Artista', listener: 'Ascoltatore', label: 'Etichetta', staff: 'Staff' };

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center text-aura-mute">Caricamento…</div>;

  const out = async () => { await logout(); router.push('/login'); };
  const outAll = async () => {
    try { await apiLogoutAll(); await logout(); router.push('/login'); }
    catch (e: any) { setMsg(e.message || 'Operazione non riuscita.'); }
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
