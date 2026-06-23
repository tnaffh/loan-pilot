import type { LoginInput, SessionUser, TenantBranding } from '@loan-pilot/domain';

/** Base URL of the API (includes the `/api` prefix). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export const TOKEN_STORAGE_KEY = 'lp_token';
export const ACCENT_STORAGE_KEY = 'lp_accent';

interface ValidationIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

export const apiFetch = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data && typeof data.message === 'string' ? data.message : response.statusText;
    const issues = data && Array.isArray(data.issues) ? data.issues : [];
    throw new ApiError(message, response.status, issues);
  }

  return data;
};

/**
 * Upload a document via multipart/form-data. `fetch` sets the multipart boundary
 * itself, so we must NOT set Content-Type. Pass `tenant` for the public
 * application endpoint (x-tenant) or `token` for authed borrower endpoints.
 */
export const uploadDocument = async (
  path: string,
  { kind, file }: { kind: string; file: File },
  auth: { token?: string | null; tenant?: string | null } = {},
): Promise<void> => {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);

  const headers: Record<string, string> = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (auth.tenant) headers['x-tenant'] = auth.tenant;

  const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: form });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data && typeof data.message === 'string' ? data.message : response.statusText;
    throw new ApiError(message, response.status);
  }
};

export interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

export const login = (input: LoginInput): Promise<LoginResponse> =>
  apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: input });

export const fetchMe = (token: string): Promise<SessionUser> =>
  apiFetch<SessionUser>('/auth/me', { token });

export const fetchTenantBranding = (token: string): Promise<TenantBranding | null> =>
  apiFetch<TenantBranding | null>('/tenants/me', { token });

// ----- invite / password reset (public) -------------------------------------

export const fetchInvite = (token: string): Promise<{ email: string; name: string }> =>
  apiFetch(`/auth/invite/${token}`);

export const acceptInvite = (token: string, password: string): Promise<LoginResponse> =>
  apiFetch<LoginResponse>('/auth/invite/accept', { method: 'POST', body: { token, password } });

export const requestPasswordReset = (email: string): Promise<{ ok: true }> =>
  apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });

export const fetchReset = (token: string): Promise<{ email: string }> =>
  apiFetch(`/auth/reset/${token}`);

export const resetPassword = (token: string, password: string): Promise<LoginResponse> =>
  apiFetch<LoginResponse>('/auth/reset-password', { method: 'POST', body: { token, password } });
