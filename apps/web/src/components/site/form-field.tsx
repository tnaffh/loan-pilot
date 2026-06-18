import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: ReactNode;
  htmlFor?: string;
  /** Marks the field optional with a muted suffix on the label. */
  optional?: boolean;
  /** Helper text shown beneath the control. */
  description?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}

/** Label + control + helper text + error, with consistent landing-page spacing. */
export const FormField = ({
  label,
  htmlFor,
  optional,
  description,
  error,
  className,
  children,
}: FormFieldProps) => (
  <div className={cn('space-y-2', className)}>
    <Label htmlFor={htmlFor}>
      {label}
      {optional ? <span className="ml-1 font-normal text-muted-foreground">(optional)</span> : null}
    </Label>
    {children}
    {error ? (
      <p className="text-xs text-destructive">{error}</p>
    ) : description ? (
      <p className="text-xs text-muted-foreground">{description}</p>
    ) : null}
  </div>
);
