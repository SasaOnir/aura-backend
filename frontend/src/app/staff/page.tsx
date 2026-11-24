'use client';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import { apiStaffList, apiStaffInvite, apiStaffRevoke, apiStaffRequireMfa, apiRolesList, BackendUnavailableError, isDemoMode } from '@/lib/api';

export default function StaffPage() {
  const [list, setList] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = () => {
    setError('');
    setUnavailable(false);
    Promise.all([apiStaffList(), apiRolesList()])
      .then(([s, r]) => { setList(s as any[]); setRoles((r as any[]).filter((x) => x.name !== 'super_admin')); })
      .catch((e) => {
        if (e instanceof BackendUnavailableError) setUnavailable(true);
        else setError(e.message);
      });
  };

  useEffect(() => { load(); }, []);

  const revoke = async (userId: string) => {
    if (isDemoMode() || unavailable) {
      alert('Servizio backend non disponibile. L\'operazione non può essere eseguita.');
      return;
    }
    const reason = prompt('Motivo revoca (PRD §4.6)?') || '';
    if (!confirm('Revocare definitivamente l\'accesso di questo collaboratore?')) return;
    try { await apiStaffRevoke(userId, reason); load(); } catch (e: any) { alert(e.message); }
  };

  const toggleMfa = async (userId: string, current: boolean) => {
    if (isDemoMode() || unavailable) {
      alert('Servizio backend non disponibile. L\'operazione non può essere eseguita.');
      return;
    }
    try { await apiStaffRequireMfa(userId, !current); load(); } catch (e: any) { alert(e.message); }
  };

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-aura-text">Collaboratori</h1>
          <p className="text-aura-mute text-sm mt-1">Staff amministrativo con ruoli e permessi assegnati dal Super Admin.</p>
        </div>
        <button onClick={() => setShowInvite(true)} disabled={unavailable || isDemoMode()} className="btn-primary" title={unavailable || isDemoMode() ? 'Servizio backend non disponibile' : ''}>+ Invita collaboratore</button>
      </div>

      {error && <div className="card bg-red-500/10 border-red-500/40 text-red-300 mb-4">{error}</div>}
      {unavailable && <div className="mb-4"><ServiceUnavailable context="caricare l'elenco dei collaboratori" /></div>}

      {!unavailable && (
        <div className="card overflow-x-auto">
          <table className="table-aura">
            <thead>
              <tr><th>Nome</th><th>Email</th><th>Stato</th><th>MFA obbligatoria</th><th>Ruoli</th><th>Ultimo accesso</th><th className="text-right">Azioni</th></tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={7} className="text-aura-dim">Nessun collaboratore.</td></tr>}
              {list.map((s: any) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.user?.displayName}</td>
                  <td className="text-aura-mute">{s.user?.email}</td>
                  <td><span className={`badge-${s.status === 'active' ? 'active' : 'suspended'}`}>{s.status}</span></td>
                  <td>
                    <button onClick={() => toggleMfa(s.userId, s.mfaRequired)} className="text-xs">
                      {s.mfaRequired ? '✅ on' : '❌ off'}
                    </button>
                  </td>
                  <td className="text-aura-mute text-xs">—</td>
                  <td className="text-aura-dim text-xs">{s.user?.lastLoginAt ? new Date(s.user.lastLoginAt).toLocaleString('it-IT') : 'mai'}</td>
                  <td>
                    <div className="flex justify-end">
                      <button onClick={() => revoke(s.userId)} className="btn-danger px-2 py-1 text-xs">Revoca accesso</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && <InviteModal roles={roles} onClose={() => setShowInvite(false)} onDone={() => { setShowInvite(false); load(); }} />}
    </Shell>
  );
}

function InviteModal({ roles, onClose, onDone }: { roles: any[]; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggle = (name: string) => setSelected((s) => s.includes(name) ? s.filter((x) => x !== name) : [...s, name]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await apiStaffInvite({ email, displayName, roleNames: selected });
      onDone();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="card max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-aura-text mb-4">Invita collaboratore</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Nome completo</label>
            <input type="text" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Ruoli da assegnare</label>
            <div className="space-y-1.5 max-h-48 overflow-auto">
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-aura-deep/40 cursor-pointer">
                  <input type="checkbox" checked={selected.includes(r.name)} onChange={() => toggle(r.name)} />
                  <div>
                    <div className="text-sm">{r.name}</div>
                    <div className="text-xs text-aura-dim">{r.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {error && <div className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-xl px-3 py-2">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Annulla</button>
            <button type="submit" disabled={loading || selected.length === 0} className="btn-primary flex-1">
              {loading ? 'Invio…' : 'Invita'}
            </button>
          </div>
          <p className="text-xs text-aura-dim">L'utente riceverà un'email di setup. In modalità dev, l'account viene creato in stato <code>pending_verification</code>.</p>
        </form>
      </div>
    </div>
  );
}
