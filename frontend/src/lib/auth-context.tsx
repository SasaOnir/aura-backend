'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiLogin, apiLogout, apiMe, apiMfaVerify, apiMfaEnable, refreshSession, SessionUser, LoginOutcome } from './api';

interface AuthCtx {
  user: SessionUser | null;
  permissions: Set<string>;
  loading: boolean;
  can: (perm: string) => boolean;
  /** Ritorna la sessione, oppure il passo MFA richiesto (nessun cookie finché non è superato). */
  login: (email: string, password: string) => Promise<{ kind: 'session'; user: SessionUser } | Exclude<LoginOutcome, { kind: 'session' }>>;
  verifyMfa: (mfaToken: string, input: { code?: string; recoveryCode?: string }) => Promise<SessionUser>;
  /** Conferma l'attivazione MFA dello staff (token di enrollment): completa il login e ritorna i codici di recupero. */
  enrollMfa: (enrollToken: string, code: string) => Promise<{ user: SessionUser; recoveryCodes: string[] }>;
  refreshUser: () => Promise<void>;
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

  const login: AuthCtx['login'] = async (email, password) => {
    const o = await apiLogin(email, password);
    if (o.kind !== 'session') return o;
    return { kind: 'session', user: await loadMe() };
  };

  const verifyMfa: AuthCtx['verifyMfa'] = async (mfaToken, input) => {
    await apiMfaVerify(mfaToken, input);
    return loadMe();
  };

  const enrollMfa: AuthCtx['enrollMfa'] = async (enrollToken, code) => {
    const r = await apiMfaEnable(code, enrollToken);
    return { user: await loadMe(), recoveryCodes: r.recoveryCodes };
  };

  const refreshUser = async () => { await loadMe(); };

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

  return <Ctx.Provider value={{ user, permissions, loading, can, login, verifyMfa, enrollMfa, refreshUser, logout }}>{children}</Ctx.Provider>;
}
