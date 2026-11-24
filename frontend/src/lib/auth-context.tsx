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
  loginDemo: () => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

const USER_KEY = 'aura_user';
const DEMO_FLAG_KEY = 'aura_demo_mode';

// Utente demo SOLO client-side, per navigare il pannello quando il backend
// non è disponibile. Non viene mai spacciato per un utente reale: la UI
// mostra un banner esplicito "modalità dimostrativa".
const DEMO_USER: AuthUser = {
  id: 'demo-00000000-0000-0000-0000-000000000000',
  email: 'demo@aura.local',
  displayName: 'Visitatore (modalità demo)',
  accountType: 'staff',
  status: 'demo',
  mfaEnabled: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    // All'avvio ripristina la sessione. Distingue:
    //   - utente reale autenticato (aura_user in sessionStorage, NON demo)
    //   - modalità demo (aura_demo_mode = '1' + aura_user = DEMO_USER)
    if (typeof window === 'undefined') { setLoading(false); return; }
    const demoFlag = sessionStorage.getItem(DEMO_FLAG_KEY);
    if (demoFlag === '1') {
      setUser(DEMO_USER);
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
  const loginDemo = () => {
    setUser(DEMO_USER);
    setIsDemo(true);
    setDemoMode(true);
    sessionStorage.setItem(DEMO_FLAG_KEY, '1');
    sessionStorage.setItem(USER_KEY, JSON.stringify(DEMO_USER));
  };

  const logout = async () => {
    try { await apiLogout(); } catch {}
    clearTokens();
    setUser(null);
    setIsDemo(false);
    setDemoMode(false);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(DEMO_FLAG_KEY);
  };

  return <Ctx.Provider value={{ user, loading, isDemo, login, loginDemo, logout }}>{children}</Ctx.Provider>;
}
