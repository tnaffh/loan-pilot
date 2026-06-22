'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { LoanStatus, fromCents, updateLoanSchema, type UpdateLoanInput } from '@loan-pilot/domain';
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
import { Textarea } from '@/components/ui/textarea';
import { FormField, selectClass } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { bumpRevalidation } from '@/lib/revalidate';
import type { LoanDetail } from '@/lib/types';

const STATUS_OPTIONS: { value: LoanStatus; label: string }[] = [
  { value: LoanStatus.Active, label: 'Active' },
  { value: LoanStatus.Arrears, label: 'In arrears' },
  { value: LoanStatus.PartlyPaid, label: 'Partly paid' },
];

const isLoanField = (path: string): path is keyof UpdateLoanInput => path in updateLoanSchema.shape;

const editableStatus = (
  status: string,
): LoanStatus.Active | LoanStatus.Arrears | LoanStatus.PartlyPaid =>
  status === LoanStatus.Arrears
    ? LoanStatus.Arrears
    : status === LoanStatus.PartlyPaid
      ? LoanStatus.PartlyPaid
      : LoanStatus.Active;

interface Props {
  loan: LoanDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export const EditLoanSheet = ({ loan, open, onOpenChange, onSaved }: Props) => {
  const { token } = useAuth();
  const hasPayments = loan.payments.length > 0;

  const defaults = (): UpdateLoanInput => ({
    disbursedAt: loan.disbursedAt ? loan.disbursedAt.slice(0, 10) : '',
    nextDueAt: loan.nextDueAt ? loan.nextDueAt.slice(0, 10) : '',
    status: editableStatus(loan.status),
    collateral: loan.collateral ?? '',
    originMonth: loan.originMonth ?? '',
    note: loan.note ?? '',
    bankCharges: fromCents(loan.bankCharges),
    namfisaLevy: fromCents(loan.namfisaLevy),
    stampDuty: fromCents(loan.stampDuty),
    amount: fromCents(loan.principal),
    termMonths: loan.termMonths,
    interestRate: loan.interestRate,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateLoanInput>({
    resolver: zodResolver(updateLoanSchema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (open) reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loan.id]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/loans/${loan.id}`, { method: 'PATCH', body: values, token });
      toast.success('Loan updated');
      bumpRevalidation();
      onOpenChange(false);
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        error.issues.forEach((issue) => {
          if (isLoanField(issue.path)) setError(issue.path, { message: issue.message });
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
          <SheetTitle>Edit loan</SheetTitle>
          <SheetDescription>
            Correct loan data. Changes are recorded in the audit trail.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-6 px-4 pb-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Disbursed" htmlFor="disbursedAt" error={errors.disbursedAt?.message}>
              <Input id="disbursedAt" type="date" {...register('disbursedAt')} />
            </FormField>
            <FormField label="Next due" htmlFor="nextDueAt" error={errors.nextDueAt?.message}>
              <Input id="nextDueAt" type="date" {...register('nextDueAt')} />
            </FormField>
            <FormField label="Status" htmlFor="status">
              <select id="status" className={selectClass} {...register('status')}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Register month" htmlFor="originMonth" optional>
              <Input id="originMonth" {...register('originMonth')} />
            </FormField>
            <FormField label="Collateral" htmlFor="collateral" optional className="sm:col-span-2">
              <Input id="collateral" {...register('collateral')} />
            </FormField>
            <FormField label="Note" htmlFor="note" optional className="sm:col-span-2">
              <Textarea id="note" rows={2} {...register('note')} />
            </FormField>
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Bank charges (N$)" htmlFor="bankCharges" error={errors.bankCharges?.message}>
                <Input id="bankCharges" type="number" inputMode="numeric" {...register('bankCharges')} />
              </FormField>
              <FormField label="NAMFISA levy (N$)" htmlFor="namfisaLevy" error={errors.namfisaLevy?.message}>
                <Input id="namfisaLevy" type="number" inputMode="numeric" {...register('namfisaLevy')} />
              </FormField>
              <FormField label="Stamp duty (N$)" htmlFor="stampDuty" error={errors.stampDuty?.message}>
                <Input id="stampDuty" type="number" inputMode="numeric" {...register('stampDuty')} />
              </FormField>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <p className="text-sm font-medium">Financial terms</p>
            {hasPayments ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                This loan has payments, so the amount, term and rate are locked. To change them, cancel
                or write off the loan and re-create it.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Changing any of these re-prices the loan and rebuilds the repayment schedule.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Principal (N$)" htmlFor="amount" error={errors.amount?.message}>
                <Input
                  id="amount"
                  type="number"
                  inputMode="numeric"
                  disabled={hasPayments}
                  {...register('amount')}
                />
              </FormField>
              <FormField label="Term (months)" htmlFor="termMonths" error={errors.termMonths?.message}>
                <Input
                  id="termMonths"
                  type="number"
                  inputMode="numeric"
                  disabled={hasPayments}
                  {...register('termMonths')}
                />
              </FormField>
              <FormField
                label="Finance rate"
                htmlFor="interestRate"
                error={errors.interestRate?.message}
                description="Decimal, e.g. 0.30 = 30%"
              >
                <Input
                  id="interestRate"
                  type="number"
                  step="0.01"
                  disabled={hasPayments}
                  {...register('interestRate')}
                />
              </FormField>
            </div>
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save changes
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
