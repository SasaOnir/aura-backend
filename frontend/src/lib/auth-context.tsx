'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiLogin, apiRegister, apiLogout, apiMe, refreshSession, SessionUser } from './api';

interface AuthCtx {
  user: SessionUser | null;
  permissions: Set<string>;
  loading: boolean;
  can: (perm: string) => boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (email: string, password: string, displayName: string, accountType: 'listener' | 'artist' | 'label') => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

const CHANNEL = 'aura-auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // I permessi arrivano dal server (/auth/me). La UI li usa solo per mostrare/nascondere:
  // l'enforcement vero resta nel backend.
  const loadMe = useCallback(async () => {
    const me = await apiMe();
    setUser(me.user);
    setPermissions(new Set(me.permissions));
    return me.user;
  }, []);

  // All'avvio la sessione si ricostruisce dal cookie httpOnly (nessun dato utente nel browser storage).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await refreshSession();
        if (s && alive) await loadMe();
      } catch {
        /* non autenticato */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loadMe]);

  // Logout in una scheda => logout in tutte.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e) => { if (e.data === 'logout') { setUser(null); setPermissions(new Set()); } };
    return () => ch.close();
  }, []);

  const login = async (email: string, password: string) => {
    await apiLogin(email, password);
    return loadMe();
  };

  const register = async (email: string, password: string, displayName: string, accountType: 'listener' | 'artist' | 'label') => {
    await apiRegister(email, password, displayName, accountType);
    return loadMe();
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
    setPermissions(new Set());
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CHANNEL);
      ch.postMessage('logout');
      ch.close();
    }
  };

  const can = (perm: string) => permissions.has(perm);

  return <Ctx.Provider value={{ user, permissions, loading, can, login, register, logout }}>{children}</Ctx.Provider>;
}
