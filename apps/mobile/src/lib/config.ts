import Constants from 'expo-constants';

/**
 * The API base URL. An explicit `EXPO_PUBLIC_API_URL` always wins. In
 * development without one, the API is assumed to run on the same machine as
 * the Metro bundler, so a phone or emulator reaches it via the bundler's host
 * (localhost alone would point at the device itself).
 */
const devApiUrl = (): string => {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:4000/api` : 'http://localhost:4000/api';
};

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? devApiUrl()).replace(/\/+$/, '');

/** The lender this build is branded for; sent as `x-tenant` on public calls. */
export const TENANT = process.env.EXPO_PUBLIC_TENANT ?? 'rfs';
