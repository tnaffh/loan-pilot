'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface Settled<T> {
  key: string;
  data: T | null;
  error: string | null;
}

/**
 * Fetch an authenticated API resource. Pass `null` to skip fetching (e.g.
 * while a route param is unresolved). `refresh()` refetches in place.
 */
export const useApi = <T>(path: string | null): UseApiResult<T> => {
  const { token } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ key: '', data: null, error: null });

  const requestKey = `${path ?? ''}|${refreshKey}|${token ?? ''}`;

  useEffect(() => {
    if (!path || !token) {
      return;
    }
    const controller = { cancelled: false };
    apiFetch<T>(path, { token })
      .then((data) => {
        if (!controller.cancelled) {
          setSettled({ key: requestKey, data, error: null });
        }
      })
      .catch((fetchError: unknown) => {
        if (!controller.cancelled) {
          setSettled({
            key: requestKey,
            data: null,
            error: fetchError instanceof ApiError ? fetchError.message : 'Something went wrong',
          });
        }
      });
    return () => {
      controller.cancelled = true;
    };
  }, [path, token, requestKey]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  return {
    data: settled.data,
    loading: Boolean(path) && settled.key !== requestKey,
    error: settled.key === requestKey ? settled.error : null,
    refresh,
  };
};
