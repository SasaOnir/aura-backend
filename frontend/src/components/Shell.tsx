'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '📊', perm: 'analytics.global' },
  { href: '/users', label: 'Utenti', icon: '👤', perm: 'users.read' },
  { href: '/staff', label: 'Collaboratori', icon: '🛡️', perm: 'users.read' },
  { href: '/roles', label: 'Ruoli & permessi', icon: '🔑', perm: 'roles.read' },
  { href: '/audit', label: 'Audit log', icon: '📜', perm: 'audit.read' },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    // Il pannello admin è solo per lo staff: gli altri account vanno alla loro area.
    else if (user.accountType !== 'staff') router.replace('/account');
  }, [user, loading, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-aura-mute">Caricamento…</div>;
  if (!user || user.accountType !== 'staff') return null;

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
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => {
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
          </div>
          <button onClick={() => logout().then(() => router.push('/login'))} className="btn-ghost w-full text-xs">
            Esci
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
