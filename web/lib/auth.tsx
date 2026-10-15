'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokens } from './api';

type User = { id?: string; role?: string; preferred_name?: string; name?: string; email?: string } | null;

const Ctx = createContext<{ user: User; loading: boolean; refresh: () => void; logout: () => void }>({ user: null, loading: true, refresh: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = tokens.get();
    if (!t) { setUser(null); setLoading(false); return; }
    try {
      const me = await api.get<any>('/me', t);
      setUser({ id: me.id, role: me.role, preferred_name: me.preferred_name, name: me.name, email: me.email });
    } catch { setUser(null); }
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    const rt = tokens.getRefresh();
    if (rt) api.post('/auth/logout', { refresh_token: rt }).catch(() => {});
    tokens.clear(); setUser(null);
  }, []);

  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener('laundromat-auth', on);
    return () => window.removeEventListener('laundromat-auth', on);
  }, [refresh]);

  return <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
