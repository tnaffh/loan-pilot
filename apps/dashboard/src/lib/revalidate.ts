'use client';

import { useSyncExternalStore } from 'react';

/**
 * A tiny global revalidation signal. Mutations triggered from the command
 * palette / quick actions can't reach a given page's `useApi` refresh, so they
 * bump this version instead; every mounted `useApi` re-fetches in response.
 */
const store = { version: 0 };
const listeners = new Set<() => void>();

export const bumpRevalidation = (): void => {
  store.version += 1;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useRevalidation = (): number =>
  useSyncExternalStore(
    subscribe,
    () => store.version,
    () => 0,
  );
