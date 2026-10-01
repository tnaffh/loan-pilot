import { ApplicationStatus, LoanStatus, RepaymentStatus } from '@loan-pilot/domain';
import type { BadgeTone } from '@/components/ui';

export const LOAN_STATUS: Record<LoanStatus, { label: string; tone: BadgeTone }> = {
  [LoanStatus.Active]: { label: 'Active', tone: 'brand' },
  [LoanStatus.Arrears]: { label: 'In arrears', tone: 'destructive' },
  [LoanStatus.PartlyPaid]: { label: 'Partly paid', tone: 'warning' },
  [LoanStatus.Settled]: { label: 'Settled', tone: 'success' },
  [LoanStatus.WrittenOff]: { label: 'Written off', tone: 'neutral' },
  [LoanStatus.Cancelled]: { label: 'Cancelled', tone: 'neutral' },
  [LoanStatus.Closed]: { label: 'Closed', tone: 'neutral' },
};

export const APPLICATION_STATUS: Record<
  ApplicationStatus,
  { label: string; tone: BadgeTone; blurb: string }
> = {
  [ApplicationStatus.Pending]: {
    label: 'Received',
    tone: 'brand',
    blurb: 'We have your application and will review it shortly.',
  },
  [ApplicationStatus.Review]: {
    label: 'In review',
    tone: 'warning',
    blurb: 'A loan officer is checking your details. We may call you.',
  },
  [ApplicationStatus.Approved]: {
    label: 'Approved',
    tone: 'success',
    blurb: 'Approved — your loan is being paid out.',
  },
  [ApplicationStatus.Declined]: {
    label: 'Declined',
    tone: 'destructive',
    blurb: 'We could not approve this application.',
  },
};

export const REPAYMENT_STATUS: Record<RepaymentStatus, { label: string; tone: BadgeTone }> = {
  [RepaymentStatus.Paid]: { label: 'Paid', tone: 'success' },
  [RepaymentStatus.Due]: { label: 'Due', tone: 'brand' },
  [RepaymentStatus.Overdue]: { label: 'Overdue', tone: 'destructive' },
  [RepaymentStatus.Waived]: { label: 'Waived', tone: 'neutral' },
};

/** Loans the borrower is still repaying. */
export const isOpenLoan = (status: LoanStatus): boolean =>
  status === LoanStatus.Active || status === LoanStatus.Arrears || status === LoanStatus.PartlyPaid;
