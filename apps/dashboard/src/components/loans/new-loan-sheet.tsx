'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  LoanType,
  createLoanSchema,
  formatNad,
  toCents,
  type CreateLoanInput,
  type LoanQuote,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { bumpRevalidation } from '@/lib/revalidate';
import { FieldError, selectClass } from '@/components/form-field';
import type { BorrowerRow } from '@/lib/types';

const TYPE_LABELS: Record<LoanType, string> = {
  [LoanType.Payday]: 'Payday',
  [LoanType.Business]: 'Business',
  [LoanType.Collateral]: 'Collateral',
};

const isLoanField = (path: string): path is keyof CreateLoanInput =>
  path in createLoanSchema.shape;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  borrowerId?: string;
}

export const NewLoanSheet = ({ open, onOpenChange, borrowerId }: Props) => {
  const { token } = useAuth();
  const { data: borrowers } = useApi<BorrowerRow[]>(open ? '/borrowers' : null);
  const [quote, setQuote] = useState<LoanQuote | null>(null);
  const [quoting, setQuoting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateLoanInput>({
    resolver: zodResolver(createLoanSchema),
    defaultValues: {
      loanType: LoanType.Payday,
      amount: 5000,
      termMonths: 1,
      borrowerId: borrowerId ?? '',
      collateral: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        loanType: LoanType.Payday,
        amount: 5000,
        termMonths: 1,
        borrowerId: borrowerId ?? '',
        collateral: '',
      });
    }
  }, [open, borrowerId, reset]);

  const amount = watch('amount');
  const termMonths = watch('termMonths');
  const loanType = watch('loanType');

  // Live quote preview (debounced) against the same pricing the API will apply.
  useEffect(() => {
    if (!open || !token) return;
    const numAmount = Number(amount);
    const numTerm = Number(termMonths);
    if (!numAmount || numAmount < 500 || !numTerm) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    const handle = setTimeout(() => {
      apiFetch<LoanQuote>('/loans/quote', {
        method: 'POST',
        body: { loanType, amount: numAmount, termMonths: numTerm },
        token,
      })
        .then((result) => setQuote(result))
        .catch(() => setQuote(null))
        .finally(() => setQuoting(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [open, token, amount, termMonths, loanType]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch('/loans', { method: 'POST', body: values, token });
      toast.success('Loan disbursed', {
        description: `${TYPE_LABELS[values.loanType]} loan of ${formatNad(toCents(values.amount))}.`,
      });
      bumpRevalidation();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        error.issues.forEach((issue) => {
          if (isLoanField(issue.path)) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Disburse a loan</SheetTitle>
          <SheetDescription>
            Price and disburse a loan to an existing borrower. Amount is in N$.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 px-4" noValidate>
          <div>
            <Label htmlFor="borrowerId">Borrower</Label>
            <select id="borrowerId" className={selectClass} {...register('borrowerId')}>
              <option value="">Select a borrower…</option>
              {(borrowers ?? []).map((borrower) => (
                <option key={borrower.id} value={borrower.id}>
                  {borrower.firstName} {borrower.lastName} — {borrower.idNumber}
                </option>
              ))}
            </select>
            <FieldError message={errors.borrowerId?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="loanType">Type</Label>
              <select id="loanType" className={selectClass} {...register('loanType')}>
                {Object.values(LoanType).map((value) => (
                  <option key={value} value={value}>
                    {TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="termMonths">Term (months)</Label>
              <Input id="termMonths" type="number" inputMode="numeric" {...register('termMonths')} />
              <FieldError message={errors.termMonths?.message} />
            </div>
            <div>
              <Label htmlFor="amount">Amount (N$)</Label>
              <Input id="amount" type="number" inputMode="numeric" {...register('amount')} />
              <FieldError message={errors.amount?.message} />
            </div>
            <div>
              <Label htmlFor="collateral">Collateral (optional)</Label>
              <Input id="collateral" {...register('collateral')} />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">Quote preview</span>
              {quoting ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>
            {quote ? (
              <dl className="grid grid-cols-2 gap-y-1.5">
                <dt className="text-muted-foreground">Principal</dt>
                <dd className="text-right tabular-nums">{formatNad(quote.principalCents)}</dd>
                <dt className="text-muted-foreground">Finance charge</dt>
                <dd className="text-right tabular-nums">{formatNad(quote.financeChargeCents)}</dd>
                <dt className="text-muted-foreground">Instalment</dt>
                <dd className="text-right tabular-nums">{formatNad(quote.instalmentCents)}</dd>
                <dt className="font-medium">Total repayable</dt>
                <dd className="text-right font-medium tabular-nums">{formatNad(quote.totalCents)}</dd>
              </dl>
            ) : (
              <p className="text-muted-foreground">Enter an amount and term to preview pricing.</p>
            )}
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Disburse loan
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
