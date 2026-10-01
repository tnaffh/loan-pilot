'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { formatNad, waiveLoanSchema, type WaiveLoanInput } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { bumpRevalidation } from '@/lib/revalidate';
import { FormField } from '@/components/form-field';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string;
  /** What is still owed and will be let go, in cents. */
  remainder: number;
  loanLabel?: string;
  /** True when converting a written-off loan rather than closing an open one. */
  writtenOff?: boolean;
}

/**
 * Settle a loan by waiving the remainder owed. For the borrower who repaid all
 * but a few dollars: the loan reads settled, and the waived amount is reported
 * as bad debt the way a write-off is.
 */
export const WaiveDialog = ({
  open,
  onOpenChange,
  loanId,
  remainder,
  loanLabel,
  writtenOff,
}: Props) => {
  const { token } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WaiveLoanInput>({ resolver: zodResolver(waiveLoanSchema) });

  useEffect(() => {
    if (open) reset({ reason: '' });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/loans/${loanId}/waive`, { method: 'POST', body: values, token });
      toast.success(`Loan settled; ${formatNad(remainder)} waived`);
      bumpRevalidation();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waive the remainder</DialogTitle>
          <DialogDescription>
            {writtenOff
              ? `${loanLabel ?? 'This loan'} is written off. Settle it instead and let the ${formatNad(remainder)} still owed go.`
              : `Settle ${loanLabel ?? 'this loan'} and let the ${formatNad(remainder)} still owed go.`}{' '}
            The loan will read as settled; the waived amount is reported as bad debt. Give a reason
            for the record.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Reason" htmlFor="waive-reason" error={errors.reason?.message}>
            <Textarea
              id="waive-reason"
              rows={3}
              placeholder="e.g. Debit order loaded for the wrong amount; remainder not pursued"
              {...register('reason')}
            />
          </FormField>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Waive {formatNad(remainder)} and settle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
