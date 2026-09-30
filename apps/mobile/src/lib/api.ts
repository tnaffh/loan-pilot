import { API_URL, TENANT } from './config';

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

/**
 * The signed-in session the client attaches to requests. Owned by AuthProvider,
 * which also registers what to do when the API rejects the token (sign out).
 */
const session: { token: string | null; onUnauthorized: (() => void) | null } = {
  token: null,
  onUnauthorized: null,
};

export const setSessionToken = (token: string | null): void => {
  session.token = token;
};

export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  session.onUnauthorized = handler;
};

const errorFrom = (status: number, data: unknown, fallback: string): ApiError => {
  if (data && typeof data === 'object') {
    const message = 'message' in data && typeof data.message === 'string' ? data.message : fallback;
    const issues = 'issues' in data && Array.isArray(data.issues) ? data.issues : [];
    return new ApiError(message, status, issues);
  }
  return new ApiError(fallback, status);
};

const headers = (json: boolean): Record<string, string> => ({
  Accept: 'application/json',
  'x-tenant': TENANT,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
});

/** JSON request against the LoanPilot API. Throws ApiError on any non-2xx. */
export const api = async <T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {},
): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: headers(options.body !== undefined),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  }).catch(() => {
    throw new ApiError('We could not reach Raccoons. Check your connection and try again.', 0);
  });

  // 204s (e.g. requesting a sign-in code) have no body; they resolve to null.
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && session.token) {
      session.onUnauthorized?.();
    }
    throw errorFrom(response.status, data, 'Something went wrong. Please try again.');
  }
  return data;
};

export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

/**
 * Multipart upload with progress (fetch has no upload progress in React Native,
 * XMLHttpRequest does). Used for application documents.
 */
export const upload = <T>(
  path: string,
  fields: Record<string, string>,
  file: UploadFile,
  onProgress?: (fraction: number) => void,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('file', file);

    const request = new XMLHttpRequest();
    request.open('POST', `${API_URL}${path}`);
    for (const [key, value] of Object.entries(headers(false))) request.setRequestHeader(key, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      const data: unknown = (() => {
        try {
          return JSON.parse(request.responseText);
        } catch {
          return null;
        }
      })();
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        resolve(JSON.parse(request.responseText));
      } else {
        reject(errorFrom(request.status, data, 'Could not upload the document'));
      }
    };
    request.onerror = () => reject(new ApiError('Upload failed. Check your connection.', 0));
    request.send(form);
  });
