'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiLogin, apiLogout, setTokens, clearTokens, getAccessToken } from './api';

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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // All'avvio: se c'è un access token, chiedi /auth/me (TODO backend) — per ora
    // assumiamo che il login persista in sessionStorage.
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('aura_user') : null;
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const r = await apiLogin(email, password);
    setTokens(r.accessToken, r.refreshToken);
    setUser(r.user);
    sessionStorage.setItem('aura_user', JSON.stringify(r.user));
  };

  const logout = async () => {
    try { await apiLogout(); } catch {}
    clearTokens();
    setUser(null);
    sessionStorage.removeItem('aura_user');
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
