'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { TenantBranding } from '@loan-pilot/domain';
import { ACCENT_STORAGE_KEY, fetchTenantBranding } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface TenantThemeValue {
  branding: TenantBranding | null;
}

const TenantThemeContext = createContext<TenantThemeValue>({ branding: null });

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const applyAccent = (accent: string | null) => {
  const root = document.documentElement;
  if (accent && HEX_COLOR.test(accent)) {
    root.style.setProperty('--brand', accent);
    root.setAttribute('data-tenant', '');
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  } else {
    root.style.removeProperty('--brand');
    root.removeAttribute('data-tenant');
    window.localStorage.removeItem(ACCENT_STORAGE_KEY);
  }
};

/**
 * Fetches the authenticated user's tenant branding and applies its accent as
 * CSS custom properties. Platform operators and logged-out users fall back to
 * the LoanPilot indigo default. A pre-paint script in the root layout sets the
 * accent before hydration, so this only keeps it in sync.
 */
export const TenantThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { status, token } = useAuth();
  const [branding, setBranding] = useState<TenantBranding | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      applyAccent(null);
      return;
    }
    if (status !== 'authenticated' || !token) {
      return;
    }
    const controller = { cancelled: false };
    fetchTenantBranding(token)
      .then((result) => {
        if (controller.cancelled) {
          return;
        }
        setBranding(result);
        applyAccent(result?.accent ?? null);
      })
      .catch(() => {
        if (!controller.cancelled) {
          setBranding(null);
          applyAccent(null);
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
