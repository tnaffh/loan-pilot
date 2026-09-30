import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Uniwind, useCSSVariable, useUniwind } from 'uniwind';

/**
 * Light/dark is a Uniwind theme: the palettes live in src/global.css under
 * `@variant light` / `@variant dark`, and every `bg-*` / `text-*` class follows
 * the active one. The borrower's choice (system, light or dark) is kept in
 * SecureStore and re-applied on launch.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'lp_theme_mode';

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'system' || value === 'light' || value === 'dark';

/** Re-apply the saved appearance once, at startup. */
export const restoreThemeMode = async (): Promise<void> => {
  const stored = await SecureStore.getItemAsync(STORAGE_KEY).catch(() => null);
  if (isThemeMode(stored)) Uniwind.setTheme(stored);
};

export interface ThemeModeState {
  mode: ThemeMode;
  scheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

export const useThemeMode = (): ThemeModeState => {
  const { theme, hasAdaptiveThemes } = useUniwind();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (isThemeMode(stored)) setModeState(stored);
      })
      .catch(() => undefined);
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    Uniwind.setTheme(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => undefined);
  };

  return {
    mode: hasAdaptiveThemes ? 'system' : mode,
    scheme: theme === 'dark' ? 'dark' : 'light',
    setMode,
  };
};

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  destructive: string;
  brand: string;
  brandDeep: string;
  brandForeground: string;
  highlight: string;
  success: string;
  warning: string;
}

const color = (value: string | number | undefined): string => String(value ?? '#000000');

/**
 * The active palette as plain strings, for the few places that need colours
 * in JS rather than classes: icon `color` props, gradients, the slider and
 * the navigation theme. Reads the same CSS variables the classes use.
 */
export const useColors = (): ThemeColors => {
  const [
    background,
    foreground,
    card,
    primary,
    primaryForeground,
    secondary,
    secondaryForeground,
    muted,
    mutedForeground,
    border,
    destructive,
    brand,
    brandDeep,
    brandForeground,
    highlight,
    success,
    warning,
  ] = useCSSVariable([
    '--color-background',
    '--color-foreground',
    '--color-card',
    '--color-primary',
    '--color-primary-foreground',
    '--color-secondary',
    '--color-secondary-foreground',
    '--color-muted',
    '--color-muted-foreground',
    '--color-border',
    '--color-destructive',
    '--color-brand',
    '--color-brand-deep',
    '--color-brand-foreground',
    '--color-highlight',
    '--color-success',
    '--color-warning',
  ]);
  return {
    background: color(background),
    foreground: color(foreground),
    card: color(card),
    primary: color(primary),
    primaryForeground: color(primaryForeground),
    secondary: color(secondary),
    secondaryForeground: color(secondaryForeground),
    muted: color(muted),
    mutedForeground: color(mutedForeground),
    border: color(border),
    destructive: color(destructive),
    brand: color(brand),
    brandDeep: color(brandDeep),
    brandForeground: color(brandForeground),
    highlight: color(highlight),
    success: color(success),
    warning: color(warning),
  };
};
