'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { apiMfaSetup, apiMfaEnable } from '@/lib/api';

/**
 * Configurazione dell'app di autenticazione: QR + chiave manuale + conferma con un primo codice.
 * - `enrollToken`: staff al primo accesso (la conferma completa il login, via onConfirm).
 * - senza token: utente già autenticato che attiva l'MFA volontariamente.
 * Il QR è generato nel browser: il segreto non passa da servizi esterni.
 */
export default function MfaEnroll({
  enrollToken,
  onConfirm,
  onDone,
  onCancel,
}: {
  enrollToken?: string;
  onConfirm: (code: string) => Promise<string[]>; // ritorna i codici di recupero
  onDone: () => void; // dopo che l'utente ha confermato di aver salvato i codici
  onCancel?: () => void;
}) {
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await apiMfaSetup(enrollToken);
        if (!alive) return;
        setSecret(s.secret);
        setQr(await QRCode.toDataURL(s.otpauthUri, { width: 192, margin: 1 }));
      } catch (e: any) {
        if (alive) setError(e.message || 'Impossibile avviare la configurazione.');
      }
    })();
    return () => { alive = false; };
  }, [enrollToken]);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { setCodes(await onConfirm(code.trim())); }
    catch (err: any) { setError(err.message || 'Codice non valido.'); }
    finally { setBusy(false); }
  };

  if (codes) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-aura-text">Conserva i codici di recupero</h2>
        <p className="text-sm text-aura-mute">
          Se perdi il telefono, ognuno di questi codici ti fa entrare <b>una volta</b>. Non verranno mostrati di nuovo:
          salvali in un posto sicuro (gestore di password, stampa).
        </p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-aura-deep border border-aura-line rounded-xl p-3">
          {codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <label className="flex items-center gap-2 text-sm text-aura-mute">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Ho salvato i codici
        </label>
        <button className="btn-primary w-full" disabled={!saved} onClick={onDone}>Continua</button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <h2 className="text-lg font-semibold text-aura-text">Attiva l'autenticazione a due fattori</h2>
      <ol className="list-decimal pl-5 text-sm text-aura-mute space-y-1">
        <li>Installa un'app di autenticazione (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>Inquadra il QR code, oppure inserisci la chiave a mano.</li>
        <li>Scrivi qui il codice a 6 cifre che l'app ti mostra.</li>
      </ol>
      {qr ? (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code per l'app di autenticazione" width={192} height={192} className="rounded-lg bg-white p-1" />
          <code className="text-xs text-aura-mute break-all select-all">{secret}</code>
        </div>
      ) : !error && <p className="text-sm text-aura-mute">Preparazione…</p>}
      <div>
        <label className="label" htmlFor="mfa-code">Codice a 6 cifre</label>
        <input id="mfa-code" className="input tracking-widest" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
      </div>
      {error && <div role="alert" className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-xl px-3 py-2">{error}</div>}
      <div className="flex gap-3">
        {onCancel && <button type="button" className="btn-ghost flex-1" onClick={onCancel}>Annulla</button>}
        <button type="submit" className="btn-primary flex-1" disabled={busy || !secret || code.length !== 6}>{busy ? 'Verifica…' : 'Attiva'}</button>
      </div>
    </form>
  );
}
