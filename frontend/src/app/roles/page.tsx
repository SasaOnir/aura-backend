'use client';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import { apiRolesList, apiRoleCreate, apiRoleDelete, apiPermissionsList, BackendUnavailableError, isDemoMode } from '@/lib/api';

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [perms, setPerms] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = () => {
    setError('');
    setUnavailable(false);
    Promise.all([apiRolesList(), apiPermissionsList()])
      .then(([r, p]) => { setRoles(r as any[]); setPerms(p as any[]); })
      .catch((e) => {
        if (e instanceof BackendUnavailableError) setUnavailable(true);
        else setError(e.message);
      });
  };
  useEffect(() => { load(); }, []);

  const del = async (id: string, name: string) => {
    if (!confirm(`Cancellare il ruolo "${name}"?`)) return;
    if (isDemoMode() || unavailable) {
      alert('Servizio backend non disponibile. L\'operazione non può essere eseguita.');
      return;
    }
    try { await apiRoleDelete(id); load(); } catch (e: any) { alert(e.message); }
  };

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-aura-text">Ruoli & permessi</h1>
          <p className="text-aura-mute text-sm mt-1">Matrice RBAC. Il ruolo <code className="text-aura-gold">super_admin</code> è protetto e non modificabile.</p>
        </div>
        <button onClick={() => setShowCreate(true)} disabled={unavailable || isDemoMode()} className="btn-primary" title={unavailable || isDemoMode() ? 'Servizio backend non disponibile' : ''}>+ Nuovo ruolo</button>
      </div>

      {error && <div className="card bg-red-500/10 border-red-500/40 text-red-300 mb-4">{error}</div>}
      {unavailable && <div className="mb-4"><ServiceUnavailable context="caricare i ruoli e i permessi" /></div>}

      {!unavailable && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {roles.map((r: any) => (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-aura-text flex items-center gap-2">
                      {r.name}
                      {r.isProtected && <span className="badge bg-aura-gold/20 text-aura-gold">🔒 protetto</span>}
                    </h3>
                    <p className="text-xs text-aura-dim mt-0.5">{r.scope}</p>
                  </div>
                  {!r.isProtected && (
                    <button onClick={() => del(r.id, r.name)} className="btn-danger px-2 py-1 text-xs">Elimina</button>
                  )}
                </div>
                {r.description && <p className="text-sm text-aura-mute mb-3">{r.description}</p>}
                <div className="text-xs text-aura-dim">
                  <span className="text-aura-violet">{r._count?.permissions || 0}</span> permessi ·{' '}
                  <span className="text-aura-teal">{r._count?.userRoles || 0}</span> utenti assegnati
                </div>
              </div>
            ))}
          </div>

          <div className="card mt-6">
            <h3 className="text-sm font-semibold text-aura-mute uppercase tracking-wider mb-3">Permessi disponibili ({perms.length})</h3>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {perms.map((p: any) => (
                <div key={p.id} className="text-xs">
                  <code className="text-aura-violet">{p.permissionKey}</code>
                  <div className="text-aura-dim mt-0.5">{p.description}</div>
                </div>
              ))}
            </div>
          </div>

          {showCreate && <CreateModal perms={perms} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />}
        </>
      )}
    </Shell>
  );
}

function CreateModal({ perms, onClose, onDone }: { perms: any[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'system' | 'organization' | 'artist'>('organization');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggle = (k: string) => setSelected((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);
  const byCat = perms.reduce((acc: any, p) => { (acc[p.category] = acc[p.category] || []).push(p); return acc; }, {});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try { await apiRoleCreate({ name, scope, description, permissionKeys: selected }); onDone(); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-aura-text mb-4">Nuovo ruolo</h3>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome ruolo</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="es. moderatore_segnalazioni" required />
            </div>
            <div>
              <label className="label">Scope</label>
              <select className="input" value={scope} onChange={(e) => setScope(e.target.value as any)}>
                <option value="organization">Organizzazione</option>
                <option value="artist">Artista</option>
                <option value="system">Sistema (richiede Super Admin)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Descrizione</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Cosa può fare questo ruolo?" />
          </div>
          <div>
            <label className="label">Permessi</label>
            <div className="space-y-3 max-h-72 overflow-auto border border-aura-line rounded-xl p-3">
              {Object.entries(byCat).map(([cat, list]: any) => (
                <div key={cat}>
                  <div className="text-xs uppercase tracking-wider text-aura-dim mb-1.5">{cat}</div>
                  <div className="space-y-1">
                    {list.map((p: any) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-aura-text">
                        <input type="checkbox" checked={selected.includes(p.permissionKey)} onChange={() => toggle(p.permissionKey)} />
                        <code className="text-aura-violet">{p.permissionKey}</code>
                        <span className="text-aura-dim text-xs">{p.description}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {error && <div className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-xl px-3 py-2">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Annulla</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Creazione…' : 'Crea ruolo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
