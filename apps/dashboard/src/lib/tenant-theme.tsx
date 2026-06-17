'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { TenantBranding } from '@loan-pilot/domain';
import { fetchTenantBranding } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface TenantThemeValue {
  branding: TenantBranding | null;
}

const TenantThemeContext = createContext<TenantThemeValue>({ branding: null });

/**
 * Fetches the authenticated user's tenant branding (name / short / logo) for
 * display in the chrome. Colour theming is intentionally not applied — the
 * dashboard uses the stock neutral shadcn palette.
 */
export const TenantThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { status, token } = useAuth();
  const [branding, setBranding] = useState<TenantBranding | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !token) {
      return;
    }
    const controller = { cancelled: false };
    fetchTenantBranding(token)
      .then((result) => {
        if (!controller.cancelled) {
          setBranding(result);
        }
      })
      .catch(() => {
        if (!controller.cancelled) {
          setBranding(null);
        }
      });
    return () => {
      controller.cancelled = true;
    };
  }, [status, token]);

  return (
    <TenantThemeContext.Provider value={{ branding }}>{children}</TenantThemeContext.Provider>
  );
};

export const useTenantBranding = (): TenantBranding | null =>
  useContext(TenantThemeContext).branding;
