'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import { apiDashboard, apiRecentActivity, BackendUnavailableError } from '@/lib/api';

export default function HomePage() {
  const [data, setData] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    Promise.all([apiDashboard(), apiRecentActivity()])
      .then(([d, a]) => { setData(d); setActivity(a as any[]); })
      .catch((e) => {
        if (e instanceof BackendUnavailableError) {
          setUnavailable(true);
        } else {
          setError(e.message);
        }
      });
  }, []);

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-aura-text">Dashboard</h1>
        <p className="text-aura-mute text-sm mt-1">Panoramica globale della piattaforma Aura.</p>
      </div>

      {error && <div className="card bg-red-500/10 border-red-500/40 text-red-300">{error}</div>}
      {unavailable && <ServiceUnavailable context="caricare la dashboard e l'attività recente" />}

      {!data && !error && !unavailable && <div className="text-aura-mute">Caricamento…</div>}

      {data && (
        <>
          {/* KPI utenti */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Utenti totali" value={data.users.total} accent="from-aura-accent to-aura-violet" />
            <Kpi label="Artisti" value={data.users.artists} accent="from-aura-violet to-aura-teal" />
            <Kpi label="Ascoltatori" value={data.users.listeners} accent="from-aura-teal to-aura-gold" />
            <Kpi label="Sospesi" value={data.users.suspended} accent="from-red-500 to-red-700" />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="card">
              <h3 className="text-sm font-semibold text-aura-mute uppercase tracking-wider mb-3">Staff & sicurezza</h3>
              <div className="space-y-3">
                <Row label="Collaboratori attivi" value={data.staff.active} />
                <Row label="MFA attiva" value={`${data.staff.mfaCoverage}%`} highlight={data.staff.mfaCoverage < 100} />
                <Row label="In attesa di verifica" value={data.users.pendingVerification} />
              </div>
              <Link href="/staff" className="btn-ghost w-full mt-4 text-xs">Gestisci collaboratori →</Link>
            </div>
            <div className="card">
              <h3 className="text-sm font-semibold text-aura-mute uppercase tracking-wider mb-3">RBAC</h3>
              <div className="space-y-3">
                <Row label="Ruoli definiti" value={data.rbac.roles} />
                <Row label="Permessi disponibili" value={data.rbac.permissions} />
              </div>
              <Link href="/roles" className="btn-ghost w-full mt-4 text-xs">Gestisci ruoli →</Link>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-aura-mute uppercase tracking-wider">Attività recente</h3>
              <span className="text-xs text-aura-dim">
                {data.audit.today} oggi · {data.audit.last7d} ultimi 7 giorni
              </span>
            </div>
            <div className="divide-y divide-aura-line">
              {activity.length === 0 && <div className="text-aura-dim text-sm py-4">Nessuna attività.</div>}
              {activity.map((a) => (
                <div key={a.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className={`badge ${a.result === 'success' ? 'badge-active' : a.result === 'denied' ? 'badge-suspended' : 'badge-pending'}`}>
                    {a.result}
                  </span>
                  <span className="font-mono text-xs text-aura-violet">{a.action}</span>
                  <span className="text-aura-mute flex-1 truncate">{a.reason || `su ${a.resourceType}:${a.resourceId?.slice(0,8)}`}</span>
                  <span className="text-aura-dim text-xs">{new Date(a.createdAt).toLocaleString('it-IT')}</span>
                </div>
              ))}
            </div>
            <Link href="/audit" className="btn-ghost w-full mt-4 text-xs">Vedi tutto l'audit log →</Link>
          </div>
        </>
      )}
    </Shell>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card relative overflow-hidden">
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl`} />
      <div className="text-xs text-aura-mute uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-bold text-aura-text mt-1">{value.toLocaleString('it-IT')}</div>
    </div>
  );
}
function Row({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-aura-mute text-sm">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-yellow-300' : 'text-aura-text'}`}>{value}</span>
    </div>
  );
}
