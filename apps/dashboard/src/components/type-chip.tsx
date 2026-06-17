import type { LoanType } from '@loan-pilot/domain';
import { Badge } from '@/components/ui/badge';

const LABELS: Record<LoanType, string> = {
  payday: 'Payday',
  business: 'Business',
  collateral: 'Collateral',
};

/** Neutral outline badge for a loan's type. */
export const TypeChip = ({ type }: { type: LoanType }) => (
  <Badge variant="outline" className="font-normal">
    {LABELS[type] ?? type}
  </Badge>
);
