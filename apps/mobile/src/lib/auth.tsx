import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from '@loan-pilot/domain';
import { api, setSessionToken, setUnauthorizedHandler } from './api';
import type { LoginResponse } from './types';

/** Same key the dashboard uses for its localStorage token. */
const TOKEN_KEY = 'lp_token';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'signedIn'; user: SessionUser };

interface AuthContextValue {
  state: AuthState;
  user: SessionUser | null;
  requestCode: (phone: string) => Promise<void>;
  verifyCode: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Borrower session. The JWT (7 days, no refresh) lives in the OS keychain via
 * SecureStore; on launch it is re-validated against `/auth/me`, and any 401
 * afterwards signs the borrower out.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const signOut = useCallback(async () => {
    setSessionToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    queryClient.clear();
    setState({ status: 'signedOut', user: null });
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    const restore = async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
      if (!token) {
        setState({ status: 'signedOut', user: null });
        return;
      }
      setSessionToken(token);
      try {
        const user = await api<SessionUser>('/auth/me');
        setState({ status: 'signedIn', user });
      } catch {
        await signOut();
      }
    };
    void restore();
  }, [signOut]);

  const requestCode = useCallback(async (phone: string) => {
    await api('/auth/otp/request', { method: 'POST', body: { phone } });
  }, []);

  const verifyCode = useCallback(async (phone: string, code: string) => {
    const response = await api<LoginResponse>('/auth/otp/verify', {
      method: 'POST',
      body: { phone, code },
    });
    setSessionToken(response.accessToken);
    await SecureStore.setItemAsync(TOKEN_KEY, response.accessToken);
    setState({ status: 'signedIn', user: response.user });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, user: state.user, requestCode, verifyCode, signOut }),
    [state, requestCode, verifyCode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};
