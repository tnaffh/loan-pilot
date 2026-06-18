import type { CreateApplicationInput } from '@loan-pilot/domain';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export interface ApplicationResult {
  id: string;
  status: string;
  affordability: 'pass' | 'review' | 'fail';
  affordabilityRatio: number;
  quotedTotal: number;
  quotedInstalment: number;
  submittedAt: string;
}

interface ValidationIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Submit a loan application to the API. Throws ApiError on validation/server errors. */
export const submitApplication = async (
  input: CreateApplicationInput,
): Promise<ApplicationResult> => {
  const response = await fetch(`${API_URL}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data.message === 'string' ? data.message : 'Something went wrong';
    const issues = data && Array.isArray(data.issues) ? data.issues : [];
    throw new ApiError(message, issues);
  }

  return data;
};

/**
 * Upload a single application document (multipart). Called after the JSON
 * application is created, so it carries the new application id.
 */
export const uploadApplicationDocument = async (
  applicationId: string,
  kind: string,
  file: File,
): Promise<{ id: string; kind: string; url: string; fileName: string }> => {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);

  const response = await fetch(`${API_URL}/applications/${applicationId}/documents`, {
    method: 'POST',
    body: form,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data.message === 'string' ? data.message : 'Could not upload document';
    throw new ApiError(message);
  }
  return data;
};
