'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import { apiDashboard, apiRecentActivity, BackendUnavailableError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { user, isDemo } = useAuth();
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

  const firstName = (user?.displayName || '').split(' ')[0] || 'Admin';
  const isSuperAdmin = user?.accountType === 'super_admin';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';

  return (
    <Shell>
      {/* Hero / benvenuto */}
      <div className="mb-8 relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-aura-violet/20 via-aura-deep to-aura-night" />
        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-aura-accent/15 blur-3xl" />
        <div className="absolute -bottom-16 -left-8 w-72 h-72 rounded-full bg-aura-teal/10 blur-3xl" />
        <div className="relative p-6 lg:p-8">
          <div className="flex items-center gap-2 text-xs text-aura-mute uppercase tracking-wider mb-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {isDemo ? 'Modalità dimostrativa' : 'Sistema operativo'}
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-aura-text tracking-tight">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-aura-mute mt-2 max-w-2xl">
            {isSuperAdmin
              ? 'Hai accesso completo al pannello di controllo della piattaforma Aura: utenti, collaboratori, ruoli, audit log.'
              : 'Hai accesso al pannello di collaborazione Aura. Le tue azioni sono limitate dal tuo ruolo e registrate nell\'audit log.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link href="/users" className="btn-primary text-xs">Gestisci utenti</Link>
            <Link href="/staff" className="btn-ghost text-xs">Collaboratori</Link>
            <Link href="/audit" className="btn-ghost text-xs">Audit log</Link>
          </div>
        </div>
      </div>

      {error && <div className="card bg-red-500/10 border-red-500/40 text-red-300 mb-6">{error}</div>}
      {unavailable && (
        <div className="mb-6">
          <ServiceUnavailable context="caricare la dashboard e l'attività recente" />
        </div>
      )}

      {!data && !error && !unavailable && (
        <div className="card text-aura-mute">Caricamento dashboard…</div>
      )}

      {data && (
        <>
          {/* KPI utenti */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi label="Utenti totali" value={data.users.total} accent="from-aura-accent to-aura-violet" icon="👥" />
            <Kpi label="Artisti" value={data.users.artists} accent="from-aura-violet to-aura-teal" icon="🎤" />
            <Kpi label="Ascoltatori" value={data.users.listeners} accent="from-aura-teal to-aura-gold" icon="🎧" />
            <Kpi label="Sospesi" value={data.users.suspended} accent="from-red-500 to-red-700" icon="⏸️" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-6">
            {/* Staff & sicurezza */}
            <div className="card lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-aura-mute uppercase tracking-wider">Staff & sicurezza</h3>
                <Link href="/staff" className="text-xs text-aura-violet hover:text-aura-accent transition">gestisci →</Link>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Collaboratori attivi" value={data.staff.active} icon="🛡️" />
                <Stat
                  label="MFA attiva"
                  value={`${data.staff.mfaCoverage}%`}
                  icon="🔐"
                  warn={data.staff.mfaCoverage < 100}
                />
                <Stat label="In attesa di verifica" value={data.users.pendingVerification} icon="⏳" />
              </div>
            </div>

            {/* RBAC */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-aura-mute uppercase tracking-wider">RBAC</h3>
                <Link href="/roles" className="text-xs text-aura-violet hover:text-aura-accent transition">gestisci →</Link>
              </div>
              <div className="space-y-3">
                <Row label="Ruoli definiti" value={data.rbac.roles} icon="🔑" />
                <Row label="Permessi disponibili" value={data.rbac.permissions} icon="✅" />
              </div>
            </div>
          </div>

          {/* Attività recente */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-aura-mute uppercase tracking-wider">Attività recente</h3>
              <span className="text-xs text-aura-dim">
                {data.audit.today} oggi · {data.audit.last7d} ultimi 7 giorni
              </span>
            </div>
            <div className="divide-y divide-aura-line">
              {activity.length === 0 && (
                <div className="text-aura-dim text-sm py-6 text-center">Nessuna attività registrata.</div>
              )}
              {activity.map((a) => (
                <div key={a.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className={`badge ${a.result === 'success' ? 'badge-active' : a.result === 'denied' ? 'badge-suspended' : 'badge-pending'}`}>
                    {a.result}
                  </span>
                  <span className="font-mono text-xs text-aura-violet">{a.action}</span>
                  <span className="text-aura-mute flex-1 truncate">{a.reason || `su ${a.resourceType}:${a.resourceId?.slice(0,8)}`}</span>
                  <span className="text-aura-dim text-xs whitespace-nowrap">{new Date(a.createdAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
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

function Kpi({ label, value, accent, icon }: { label: string; value: number; accent: string; icon: string }) {
  return (
    <div className="card relative overflow-hidden group">
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl group-hover:opacity-30 transition`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="text-xs text-aura-mute uppercase tracking-wider">{label}</div>
          <span className="text-base opacity-70">{icon}</span>
        </div>
        <div className="text-3xl font-bold text-aura-text mt-2">{value.toLocaleString('it-IT')}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, warn }: { label: string; value: any; icon: string; warn?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-2xl font-bold ${warn ? 'text-yellow-300' : 'text-aura-text'}`}>{value}</div>
      <div className="text-[11px] text-aura-mute uppercase tracking-wider mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: any; icon: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-aura-mute text-sm flex items-center gap-2">
        <span className="text-base opacity-70">{icon}</span>
        {label}
      </span>
      <span className="font-semibold text-aura-text">{value}</span>
    </div>
  );
}
