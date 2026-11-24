'use client';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import { apiUsersList, apiUserSuspend, apiUserReactivate, apiUserDelete, apiUserExport, BackendUnavailableError, isDemoMode } from '@/lib/api';

export default function UsersPage() {
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = () => {
    setError('');
    setUnavailable(false);
    apiUsersList({ search: search || undefined, accountType: filter || undefined, limit: 50 })
      .then(setData)
      .catch((e) => {
        if (e instanceof BackendUnavailableError) setUnavailable(true);
        else setError(e.message);
      });
  };

  useEffect(() => { load(); }, [search, filter]);

  // Azioni disabilitate in modalità demo o backend non disponibile.
  // NON vengono simulate come riuscite: l'errore viene mostrato esplicitamente.
  const actionDisabled = () => {
    if (isDemoMode() || unavailable) {
      alert('Servizio backend non disponibile. L\'operazione non può essere eseguita in modalità demo o senza backend.');
      return true;
    }
    return false;
  };

  const suspend = async (id: string, reason: string) => {
    if (!reason) return alert('Inserisci un motivo (PRD §4.6).');
    if (actionDisabled()) return;
    setBusy(id);
    try {
      await apiUserSuspend(id, reason);
      load();
    } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  };

  const reactivate = async (id: string) => {
    if (actionDisabled()) return;
    setBusy(id);
    try { await apiUserReactivate(id); load(); } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  };

  const del = async (id: string) => {
    if (!confirm('Cancellare definitivamente l\'account? (GDPR art.17)')) return;
    if (actionDisabled()) return;
    setBusy(id);
    try { await apiUserDelete(id); load(); } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  };

  const exportData = async (id: string) => {
    if (actionDisabled()) return;
    try {
      const data = await apiUserExport(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `user-${id.slice(0,8)}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { alert(e.message); }
  };

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-aura-text">Utenti</h1>
        <p className="text-aura-mute text-sm mt-1">Artisti, ascoltatori, label e staff della piattaforma.</p>
      </div>

      <div className="card mb-4 flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Cerca per email o nome…"
          className="input flex-1 min-w-[200px]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Tutti i tipi</option>
          <option value="listener">Ascoltatori</option>
          <option value="artist">Artisti</option>
          <option value="label">Label</option>
          <option value="staff">Staff</option>
        </select>
      </div>

      {error && <div className="card bg-red-500/10 border-red-500/40 text-red-300 mb-4">{error}</div>}
      {unavailable && <div className="mb-4"><ServiceUnavailable context="caricare l'elenco degli utenti" /></div>}

      {!unavailable && (
        <div className="card overflow-x-auto">
          <table className="table-aura">
            <thead>
              <tr>
                <th>Nome</th><th>Email</th><th>Tipo</th><th>Stato</th><th>MFA</th><th>Ultimo accesso</th><th className="text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {!data && <tr><td colSpan={7} className="text-aura-dim">Caricamento…</td></tr>}
              {data?.items?.map((u: any) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.displayName}</td>
                  <td className="text-aura-mute">{u.email}</td>
                  <td><span className="badge-active">{u.accountType}</span></td>
                  <td>
                    <span className={`badge-${u.status === 'active' ? 'active' : u.status === 'suspended' ? 'suspended' : u.status === 'pending_verification' ? 'pending' : 'deleted'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td>{u.mfaEnabled ? '✅' : '—'}</td>
                  <td className="text-aura-dim text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('it-IT') : 'mai'}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => exportData(u.id)} className="btn-ghost px-2 py-1 text-xs" title="Esporta dati (GDPR art.20)">⬇️</button>
                      {u.status === 'active' && (
                        <button
                          onClick={() => suspend(u.id, prompt('Motivo sospensione (PRD §4.6)?') || '')}
                          disabled={busy === u.id}
                          className="btn-ghost px-2 py-1 text-xs"
                          title="Sospendi"
                        >⏸️</button>
                      )}
                      {u.status === 'suspended' && (
                        <button onClick={() => reactivate(u.id)} disabled={busy === u.id} className="btn-ghost px-2 py-1 text-xs" title="Riattiva">▶️</button>
                      )}
                      <button onClick={() => del(u.id)} disabled={busy === u.id} className="btn-danger px-2 py-1 text-xs" title="Cancella (GDPR art.17)">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
