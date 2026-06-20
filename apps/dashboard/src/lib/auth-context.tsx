'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { LoginInput, SessionUser } from '@loan-pilot/domain';
import { TOKEN_STORAGE_KEY, fetchMe, login as loginRequest } from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: SessionUser | null;
  token: string | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<SessionUser>;
  /** Adopt a token obtained out-of-band (OAuth callback); fetches the session. */
  loginWithToken: (token: string) => Promise<SessionUser>;
  /** Adopt a token + already-known session (invite accept / password reset). */
  setSession: (token: string, user: SessionUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const readStoredToken = (): string | null =>
  typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_STORAGE_KEY);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    readStoredToken() ? 'loading' : 'unauthenticated',
  );

  useEffect(() => {
    const stored = readStoredToken();
    if (!stored) {
      return;
    }
    fetchMe(stored)
      .then((session) => {
        setToken(stored);
        setUser(session);
        setStatus('authenticated');
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setStatus('unauthenticated');
      });
  }, []);

  const setSession = useCallback((nextToken: string, nextUser: SessionUser) => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      const response = await loginRequest(input);
      setSession(response.accessToken, response.user);
      return response.user;
    },
    [setSession],
  );

  const loginWithToken = useCallback(
    async (nextToken: string) => {
      const session = await fetchMe(nextToken);
      setSession(nextToken, session);
      return session;
    },
    [setSession],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, status, login, loginWithToken, setSession, logout }),
    [user, token, status, login, loginWithToken, setSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
