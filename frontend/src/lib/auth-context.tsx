'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiLogin, apiLogout, setTokens, clearTokens, getAccessToken, setDemoMode } from './api';

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  accountType: string;
  status: string;
  mfaEnabled: boolean;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  isDemo: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginDemo: (role?: DemoRole) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

const USER_KEY = 'aura_user';
const DEMO_FLAG_KEY = 'aura_demo_mode';
const DEMO_ROLE_KEY = 'aura_demo_role';

// Utenti demo SOLO client-side, per navigare il pannello quando il backend
// non è disponibile. Non vengono mai spacciati per utenti reali: la UI
// mostra un banner esplicito "modalità dimostrativa".
//
// Ruoli demo:
//   - super_admin: vede tutte le sezioni (mirrors di sasacaruso84@gmail.com,
//     il Super Admin reale bootstrapato da env quando il backend è online)
//   - staff: collaboratore con accesso a Dashboard + Audit (read-only)
//
// Quando il backend sarà online, le credenziali reali sostituiranno queste
// fittizie: l'utente reale è sasacaruso84@gmail.com (Super Admin, bootstrap
// da env come previsto in backend/src/auth/super-admin.service.ts).
const DEMO_USERS: Record<'super_admin' | 'staff', AuthUser> = {
  super_admin: {
    id: 'demo-00000000-0000-0000-0000-000000000001',
    email: 'sasacaruso84@gmail.com',
    displayName: 'Sasa Caruso (Super Admin · demo)',
    accountType: 'super_admin',
    status: 'demo',
    mfaEnabled: true,
  },
  staff: {
    id: 'demo-00000000-0000-0000-0000-000000000002',
    email: 'collaboratore@aura.local',
    displayName: 'Collaboratore (demo)',
    accountType: 'staff',
    status: 'demo',
    mfaEnabled: false,
  },
};

export type DemoRole = 'super_admin' | 'staff';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') { setLoading(false); return; }
    const demoFlag = sessionStorage.getItem(DEMO_FLAG_KEY);
    if (demoFlag === '1') {
      const role = (sessionStorage.getItem(DEMO_ROLE_KEY) as DemoRole) || 'super_admin';
      setUser(DEMO_USERS[role]);
      setIsDemo(true);
      setDemoMode(true);
    } else {
      const stored = sessionStorage.getItem(USER_KEY);
      if (stored) {
        try { setUser(JSON.parse(stored)); } catch {}
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const r = await apiLogin(email, password);
    setTokens(r.accessToken, r.refreshToken);
    setUser(r.user);
    setIsDemo(false);
    setDemoMode(false);
    sessionStorage.setItem(USER_KEY, JSON.stringify(r.user));
  };

  // Entra in modalità demo SENZA chiamare il backend. Utente fittizio
  // client-side solo per navigare le schermate quando il backend è offline.
  // Il ruolo determina quale utente demo impersonare (super_admin o staff).
  const loginDemo = (role: DemoRole = 'super_admin') => {
    const demoUser = DEMO_USERS[role];
    setUser(demoUser);
    setIsDemo(true);
    setDemoMode(true);
    sessionStorage.setItem(DEMO_FLAG_KEY, '1');
    sessionStorage.setItem(DEMO_ROLE_KEY, role);
    sessionStorage.setItem(USER_KEY, JSON.stringify(demoUser));
  };

  const logout = async () => {
    try { await apiLogout(); } catch {}
    clearTokens();
    setUser(null);
    setIsDemo(false);
    setDemoMode(false);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(DEMO_FLAG_KEY);
    sessionStorage.removeItem(DEMO_ROLE_KEY);
  };

  return <Ctx.Provider value={{ user, loading, isDemo, login, loginDemo, logout }}>{children}</Ctx.Provider>;
}
