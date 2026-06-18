'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { writeOffLoanSchema, type WriteOffLoanInput } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { bumpRevalidation } from '@/lib/revalidate';
import { FieldError } from '@/components/form-field';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string;
  loanLabel?: string;
}

export const WriteOffDialog = ({ open, onOpenChange, loanId, loanLabel }: Props) => {
  const { token } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WriteOffLoanInput>({ resolver: zodResolver(writeOffLoanSchema) });

  useEffect(() => {
    if (open) reset({ reason: '' });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/loans/${loanId}/write-off`, { method: 'POST', body: values, token });
      toast.success('Loan written off');
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
          <DialogTitle>Write off loan</DialogTitle>
          <DialogDescription>
            Mark {loanLabel ? `${loanLabel}` : 'this loan'} as unrecoverable bad debt. It leaves the
            active book. Give a reason for the record.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" rows={3} {...register('reason')} />
            <FieldError message={errors.reason?.message} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Write off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
