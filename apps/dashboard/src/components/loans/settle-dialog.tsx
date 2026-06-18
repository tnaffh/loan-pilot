'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { bumpRevalidation } from '@/lib/revalidate';
import { selectClass } from '@/components/form-field';

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
            <div>
              <Label htmlFor="paidAt">Date</Label>
              <Input id="paidAt" type="date" {...register('paidAt')} />
            </div>
            <div>
              <Label htmlFor="method">Method</Label>
              <select id="method" className={selectClass} {...register('method')}>
                {Object.values(PaymentMethod).map((value) => (
                  <option key={value} value={value}>
                    {METHOD_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <Input id="note" {...register('note')} />
          </div>
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
