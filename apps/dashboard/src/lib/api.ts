import type { LoginInput, SessionUser } from '@loan-pilot/domain';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export const TOKEN_STORAGE_KEY = 'lp_token';

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

export interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

export const login = (input: LoginInput): Promise<LoginResponse> =>
  apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: input });

export const fetchMe = (token: string): Promise<SessionUser> =>
  apiFetch<SessionUser>('/auth/me', { token });
