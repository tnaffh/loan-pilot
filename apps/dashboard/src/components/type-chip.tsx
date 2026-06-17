import type { LoanType } from '@loan-pilot/domain';

const LABELS: Record<LoanType, string> = {
  payday: 'Payday',
  business: 'Business',
  collateral: 'Collateral',
};

/** Neutral pill for a loan's type. */
export const TypeChip = ({ type }: { type: LoanType }) => (
  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
    {LABELS[type] ?? type}
  </span>
);
