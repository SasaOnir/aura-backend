'use client';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { apiAuditList } from '@/lib/api';

export default function AuditPage() {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    apiAuditList({ limit: 100, action: filter || undefined })
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, [filter]);

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-aura-text">Audit log</h1>
        <p className="text-aura-mute text-sm mt-1">
          Registro immutabile delle operazioni amministrative (PRD §4.6).
          Append-only: protetto contro alterazioni e cancellazioni.
        </p>
      </div>

      <div className="card mb-4 flex gap-3">
        <input
          className="input flex-1"
          placeholder="Filtra per action (es. user.suspend, role.create)…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {error && <div className="card bg-red-500/10 border-red-500/40 text-red-300 mb-4">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="table-aura">
          <thead>
            <tr>
              <th>Quando</th><th>Attore</th><th>Azione</th><th>Risorsa</th><th>Risultato</th><th>IP</th><th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan={7} className="text-aura-dim">Caricamento…</td></tr>}
            {data?.items?.map((a: any) => (
              <tr key={a.id}>
                <td className="text-aura-dim text-xs whitespace-nowrap">{new Date(a.createdAt).toLocaleString('it-IT')}</td>
                <td className="text-aura-mute">{a.actorId?.slice(0, 8) || 'system'}</td>
                <td><code className="text-aura-violet text-xs">{a.action}</code></td>
                <td className="text-aura-mute text-xs">{a.resourceType}:{a.resourceId?.slice(0, 8) || '—'}</td>
                <td>
                  <span className={`badge ${a.result === 'success' ? 'badge-active' : a.result === 'denied' ? 'badge-suspended' : 'badge-pending'}`}>
                    {a.result}
                  </span>
                </td>
                <td className="text-aura-dim text-xs font-mono">{a.ip || '—'}</td>
                <td className="text-aura-mute text-xs max-w-xs truncate">{a.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
