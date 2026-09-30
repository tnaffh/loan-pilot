import { useQuery } from '@tanstack/react-query';
import type { PricingConfig } from '@loan-pilot/domain';
import { api } from './api';
import { useAuth } from './auth';
import type { LoanDetail, LoanRow, LoanStatement, MyApplication } from './types';

export const queryKeys = {
  loans: ['loans'] as const,
  loan: (id: string) => ['loans', id] as const,
  statement: (id: string) => ['loans', id, 'statement'] as const,
  myApplications: ['applications', 'mine'] as const,
  pricing: ['pricing'] as const,
};

const useSignedIn = (): boolean => useAuth().state.status === 'signedIn';

export const useLoans = () =>
  useQuery({
    queryKey: queryKeys.loans,
    queryFn: () => api<LoanRow[]>('/loans'),
    enabled: useSignedIn(),
  });

export const useLoan = (id: string) =>
  useQuery({
    queryKey: queryKeys.loan(id),
    queryFn: () => api<LoanDetail>(`/loans/${id}`),
    enabled: useSignedIn(),
  });

export const useStatement = (id: string) =>
  useQuery({
    queryKey: queryKeys.statement(id),
    queryFn: () => api<LoanStatement>(`/loans/${id}/statement`),
    enabled: useSignedIn(),
  });

export const useMyApplications = () =>
  useQuery({
    queryKey: queryKeys.myApplications,
    queryFn: () => api<MyApplication[]>('/applications/mine'),
    enabled: useSignedIn(),
  });

/**
 * The lender's public pricing (active rates + fees) so quotes match the API's
 * exactly. Null on failure: `quoteWithPricing` then falls back to a fee-less
 * estimate rather than blocking the calculator.
 */
export const usePricing = () =>
  useQuery({
    queryKey: queryKeys.pricing,
    queryFn: () => api<PricingConfig>('/applications/pricing').catch(() => null),
    staleTime: 60 * 60 * 1000,
  });
