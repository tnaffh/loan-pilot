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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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

/**
 * The file name a response asks to be saved under (`Content-Disposition`),
 * preferring the UTF-8 `filename*` form; null when the header carries none.
 */
const dispositionFileName = (response: Response): string | null => {
  const header = response.headers.get('Content-Disposition');
  if (!header) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // Fall through to the plain form.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? null;
};

/**
 * Fetch a server-generated or stored binary (PDF / spreadsheet / scan) from an
 * authenticated route and save it under a proper name.
 *
 * Everything goes through the API with the JWT rather than a bare storage URL:
 * storage keys are opaque UUIDs, and a cross-origin link ignores the `download`
 * attribute, so only a same-origin object URL lets the browser use the real
 * file name. The server's `Content-Disposition` name wins over `fallbackName`.
 */
export const downloadFile = async (
  path: string,
  fallbackName: string,
  token: string | null,
): Promise<void> => {
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message =
      data && typeof data.message === 'string' ? data.message : response.statusText;
    throw new ApiError(message, response.status);
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = dispositionFileName(response) ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Download a stored document (agreement, scan, statement…) under its real file name. */
export const downloadDocument = (
  document: { id: string; fileName: string },
  token: string | null,
): Promise<void> => downloadFile(`/documents/${document.id}/download`, document.fileName, token);

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
