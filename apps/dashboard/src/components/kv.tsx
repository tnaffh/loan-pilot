import { cn } from '@/lib/utils';

/** Key/value cell for detail pages and the borrower portal. */
export const Kv = ({
  label,
  value,
  large,
}: {
  label: string;
  value: string;
  large?: boolean;
}) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className={cn('font-medium', large ? 'text-lg' : 'text-sm')}>{value}</dd>
  </div>
);
