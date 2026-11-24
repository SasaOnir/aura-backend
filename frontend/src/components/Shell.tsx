'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '📊', perm: null },
  { href: '/users', label: 'Utenti', icon: '👤', perm: 'users.read' },
  { href: '/staff', label: 'Collaboratori', icon: '🛡️', perm: 'staff' },
  { href: '/roles', label: 'Ruoli & permessi', icon: '🔑', perm: 'roles.read' },
  { href: '/audit', label: 'Audit log', icon: '📜', perm: 'audit.read' },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isDemo } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [perms, setPerms] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Recupera permessi (una sola volta dopo login)
  useEffect(() => {
    if (!user) return;
    // L'endpoint /users/:id ritorna anche i ruoli/permessi; in produzione ottimizzare.
    // Per ora: il Super Admin vede tutto; altri vedono ciò che l'API permette.
    setPerms(new Set()); // TODO: GET /auth/me → permissions
  }, [user]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-aura-mute">Caricamento…</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r border-aura-line bg-aura-night/60 flex flex-col">
        <div className="p-5 border-b border-aura-line">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-aura-accent via-aura-violet to-aura-teal" />
            <div>
              <div className="font-bold text-aura-text">Aura</div>
              <div className="text-[10px] uppercase tracking-wider text-aura-dim">Control</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                  active
                    ? 'bg-aura-deep text-aura-text border border-aura-line'
                    : 'text-aura-mute hover:bg-aura-deep/40 hover:text-aura-text'
                }`}
              >
                <span className="text-base">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-aura-line">
          <div className="px-3 py-2 mb-2">
            <div className="text-xs text-aura-mute">Connesso come</div>
            <div className="text-sm text-aura-text truncate">{user.displayName}</div>
            <div className="text-[11px] text-aura-dim truncate">{user.email}</div>
            {isDemo && (
              <div className="mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">
                modalità demo
              </div>
            )}
          </div>
          <button onClick={() => logout().then(() => router.push('/login'))} className="btn-ghost w-full text-xs">
            Esci
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {isDemo && (
          <div className="bg-yellow-500/15 border-b border-yellow-500/30 text-yellow-200 text-sm px-6 py-2.5">
            ⚠️ <strong>Modalità dimostrativa</strong> — il backend non è disponibile. Le pagine mostrano
            stati realistici di servizio non disponibile; nessuna operazione viene eseguita né simulata come riuscita.
            Tutti i dati sono fittizi a scopo di navigazione.
          </div>
        )}
        <div className="max-w-7xl mx-auto p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
