'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { cancelLoanSchema, type CancelLoanInput } from '@loan-pilot/domain';
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
  loanLabel?: string;
}

export const CancelDialog = ({ open, onOpenChange, loanId, loanLabel }: Props) => {
  const { token } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CancelLoanInput>({ resolver: zodResolver(cancelLoanSchema) });

  useEffect(() => {
    if (open) reset({ reason: '' });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/loans/${loanId}/cancel`, { method: 'POST', body: values, token });
      toast.success('Loan cancelled');
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
          <DialogTitle>Cancel loan</DialogTitle>
          <DialogDescription>
            Void {loanLabel ? `${loanLabel}` : 'this loan'} — for loans created in error or that fell
            through. Only possible while no payments have been recorded. Give a reason for the record.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Reason" htmlFor="reason" error={errors.reason?.message}>
            <Textarea id="reason" rows={3} {...register('reason')} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Keep loan
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Cancel loan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
