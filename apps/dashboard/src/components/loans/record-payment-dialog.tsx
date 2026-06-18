'use client';

import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  PaymentMethod,
  createPaymentSchema,
  formatNad,
  type CreatePaymentInput,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { bumpRevalidation } from '@/lib/revalidate';
import { FormField } from '@/components/form-field';
import type { LoanRow } from '@/lib/types';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.Cash]: 'Cash',
  [PaymentMethod.Eft]: 'EFT',
  [PaymentMethod.DebitOrder]: 'Debit order',
  [PaymentMethod.Deposit]: 'Deposit',
  [PaymentMethod.Ewallet]: 'E-wallet',
  [PaymentMethod.Payroll]: 'Payroll',
  [PaymentMethod.Revolved]: 'Revolved',
};

const today = (): string => new Date().toISOString().slice(0, 10);

const isPaymentField = (path: string): path is keyof CreatePaymentInput =>
  path in createPaymentSchema.shape;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselect a loan; when omitted the dialog shows an open-loan picker. */
  loanId?: string;
  loanLabel?: string;
}

export const RecordPaymentDialog = ({ open, onOpenChange, loanId, loanLabel }: Props) => {
  const { token } = useAuth();
  // Only fetch the loan list when we need the picker (no preselected loan).
  const { data: loans } = useApi<LoanRow[]>(open && !loanId ? '/loans' : null);
  const openLoans = useMemo(
    () => (loans ?? []).filter((loan) => loan.status === 'active' || loan.status === 'arrears'),
    [loans],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreatePaymentInput>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: { method: PaymentMethod.Cash, paidAt: today(), loanId: loanId ?? '' },
  });

  useEffect(() => {
    if (open) reset({ method: PaymentMethod.Cash, paidAt: today(), loanId: loanId ?? '' });
  }, [open, loanId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch('/payments', { method: 'POST', body: values, token });
      toast.success('Payment recorded');
      bumpRevalidation();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        error.issues.forEach((issue) => {
          if (isPaymentField(issue.path)) {
            setError(issue.path, { message: issue.message });
          }
        });
        toast.error(error.message);
      } else {
        toast.error('Something went wrong');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {loanLabel
              ? `Capture a payment against ${loanLabel}. Amount is in N$.`
              : 'Capture a payment against an open loan. Amount is in N$.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {loanId ? (
            <input type="hidden" {...register('loanId')} />
          ) : (
            <FormField label="Loan" htmlFor="loanId" error={errors.loanId?.message}>
              <Controller
                control={control}
                name="loanId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="loanId" className="w-full">
                      <SelectValue placeholder="Select an open loan…" />
                    </SelectTrigger>
                    <SelectContent>
                      {openLoans.map((loan) => (
                        <SelectItem key={loan.id} value={loan.id}>
                          {loan.borrower.firstName} {loan.borrower.lastName} — {formatNad(loan.balance)} due
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount (N$)" htmlFor="amount" error={errors.amount?.message}>
              <Input id="amount" type="number" step="0.01" inputMode="decimal" {...register('amount')} />
            </FormField>
            <FormField label="Date" htmlFor="paidAt" error={errors.paidAt?.message}>
              <Controller
                control={control}
                name="paidAt"
                render={({ field }) => (
                  <DatePicker id="paidAt" value={field.value} onChange={field.onChange} disableFuture />
                )}
              />
            </FormField>
            <FormField label="Method" htmlFor="method">
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(PaymentMethod).map((value) => (
                        <SelectItem key={value} value={value}>
                          {METHOD_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <div className="flex items-end gap-2 pb-1.5">
              <Controller
                control={control}
                name="badDebt"
                render={({ field }) => (
                  <Checkbox
                    id="badDebt"
                    checked={field.value ?? false}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <Label htmlFor="badDebt" className="font-normal">
                Flag as bad debt
              </Label>
            </div>
          </div>
          <FormField label="Note" htmlFor="note" optional>
            <Input id="note" {...register('note')} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
