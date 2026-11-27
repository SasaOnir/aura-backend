'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiPublic } from '@/lib/api';

// Il token arriva nel FRAGMENT (#token=…): non viene inviato al server e non finisce nei log o nel Referer.
export default function VerifyEmailPage() {
  const [state, setState] = useState<'work' | 'ok' | 'err'>('work');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    history.replaceState(null, '', window.location.pathname); // toglie il token dalla barra degli indirizzi
    if (!token) { setState('err'); setMsg('Link non valido.'); return; }
    apiPublic('verify-email', { token }).then(() => setState('ok')).catch((e) => { setState('err'); setMsg(e.message); });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md card text-center space-y-3">
        {state === 'work' && <p className="text-aura-mute">Verifica in corso…</p>}
        {state === 'ok' && (<><h1 className="text-xl font-bold text-aura-text">Email verificata</h1><p className="text-aura-mute text-sm">Il tuo account è attivo.</p><Link href="/login" className="btn-primary inline-block">Accedi</Link></>)}
        {state === 'err' && (<><h1 className="text-xl font-bold text-aura-text">Link non valido o scaduto</h1><p className="text-aura-mute text-sm">{msg}</p><Link href="/login" className="btn-ghost inline-block">Torna al login</Link></>)}
      </div>
    </div>
  );
}
