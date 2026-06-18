'use client';

import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  PaymentMethod,
  formatNad,
  settleLoanSchema,
  type SettleLoanInput,
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
import { bumpRevalidation } from '@/lib/revalidate';
import { FormField } from '@/components/form-field';

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string;
  balance: number;
  loanLabel?: string;
}

export const SettleDialog = ({ open, onOpenChange, loanId, balance, loanLabel }: Props) => {
  const { token } = useAuth();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<SettleLoanInput>({
    resolver: zodResolver(settleLoanSchema),
    defaultValues: { method: PaymentMethod.Cash, paidAt: today() },
  });

  useEffect(() => {
    if (open) reset({ method: PaymentMethod.Cash, paidAt: today() });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/loans/${loanId}/settle`, { method: 'POST', body: values, token });
      toast.success('Loan settled', { description: `${formatNad(balance)} cleared.` });
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
          <DialogTitle>Settle loan early</DialogTitle>
          <DialogDescription>
            Clear the full outstanding balance of{' '}
            <span className="font-medium text-foreground">{formatNad(balance)}</span>
            {loanLabel ? ` on ${loanLabel}` : ''} in one payment. This closes the loan as settled.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date" htmlFor="paidAt">
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
              Settle {formatNad(balance)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
