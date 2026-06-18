import { Banknote, Briefcase, Landmark, type LucideIcon } from 'lucide-react';
import type { LoanType } from '@loan-pilot/domain';
import { Badge } from '@/components/ui/badge';

const META: Record<LoanType, { label: string; icon: LucideIcon }> = {
  payday: { label: 'Payday', icon: Banknote },
  business: { label: 'Business', icon: Briefcase },
  collateral: { label: 'Collateral', icon: Landmark },
};

/** Outline badge for a loan's type, with a matching icon. */
export const TypeChip = ({ type }: { type: LoanType }) => {
  const meta = META[type];
  const Icon = meta?.icon;
  return (
    <Badge variant="outline" className="font-normal">
      {Icon ? <Icon /> : null}
      {meta?.label ?? type}
    </Badge>
  );
};
