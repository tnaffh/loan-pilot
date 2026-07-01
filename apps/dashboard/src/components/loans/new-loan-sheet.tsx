'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { bumpRevalidation } from '@/lib/revalidate';
import { cn } from '@/lib/utils';
import { FormField } from '@/components/form-field';
import type { BorrowerRow } from '@/lib/types';

const TYPE_LABELS: Record<LoanType, string> = {
  [LoanType.Payday]: 'Payday',
  [LoanType.Business]: 'Business',
  [LoanType.Collateral]: 'Collateral',
};

interface LoanProductOption {
  id: string;
  name: string;
  loanType: LoanType | null;
  interestRate: number;
  active: boolean;
  isDefault: boolean;
}

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
  const { data: products } = useApi<LoanProductOption[]>(open ? '/settings/products' : null);
  const activeProducts = (products ?? []).filter((product) => product.active);
  const [productId, setProductId] = useState('');
  const [customRate, setCustomRate] = useState('');
  const [quote, setQuote] = useState<LoanQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [borrowerOpen, setBorrowerOpen] = useState(false);

  const {
    register,
    control,
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
      setProductId('');
      setCustomRate('');
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
        body: {
          loanType,
          amount: numAmount,
          termMonths: numTerm,
          productId: productId || undefined,
          interestRate: customRate ? Number(customRate) / 100 : undefined,
        },
        token,
      })
        .then((result) => setQuote(result))
        .catch(() => setQuote(null))
        .finally(() => setQuoting(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [open, token, amount, termMonths, loanType, productId, customRate]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch('/loans', {
        method: 'POST',
        body: {
          ...values,
          productId: productId || undefined,
          interestRate: customRate ? Number(customRate) / 100 : undefined,
        },
        token,
      });
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
          <FormField label="Borrower" htmlFor="borrowerId" error={errors.borrowerId?.message}>
            <Controller
              control={control}
              name="borrowerId"
              render={({ field }) => {
                const selected = (borrowers ?? []).find((borrower) => borrower.id === field.value);
                return (
                  <Popover open={borrowerOpen} onOpenChange={setBorrowerOpen}>
                    <PopoverTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          id="borrowerId"
                          className="w-full justify-between font-normal"
                        />
                      }
                    >
                      <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                        {selected
                          ? `${selected.firstName} ${selected.lastName} — ${selected.idNumber}`
                          : 'Select a borrower…'}
                      </span>
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-(--anchor-width) p-0">
                      <Command>
                        <CommandInput placeholder="Search by name or ID…" />
                        <CommandList>
                          <CommandEmpty>No borrower found.</CommandEmpty>
                          <CommandGroup>
                            {(borrowers ?? []).map((borrower) => (
                              <CommandItem
                                key={borrower.id}
                                value={`${borrower.firstName} ${borrower.lastName} ${borrower.idNumber}`}
                                onSelect={() => {
                                  field.onChange(borrower.id);
                                  setBorrowerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 size-4',
                                    field.value === borrower.id ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                {borrower.firstName} {borrower.lastName} — {borrower.idNumber}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                );
              }}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type" htmlFor="loanType">
              <Controller
                control={control}
                name="loanType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="loanType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(LoanType).map((value) => (
                        <SelectItem key={value} value={value}>
                          {TYPE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Term (months)" htmlFor="termMonths" error={errors.termMonths?.message}>
              <Input id="termMonths" type="number" inputMode="numeric" {...register('termMonths')} />
            </FormField>
            <FormField label="Amount (N$)" htmlFor="amount" error={errors.amount?.message}>
              <Input id="amount" type="number" inputMode="numeric" {...register('amount')} />
            </FormField>
            <FormField label="Collateral" htmlFor="collateral" optional>
              <Input id="collateral" {...register('collateral')} />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Rate plan"
              htmlFor="productId"
              description="Defaults to the standard rate when none is chosen."
            >
              <Select
                value={productId || undefined}
                onValueChange={(value) => setProductId(value ?? '')}
              >
                <SelectTrigger id="productId" className="w-full">
                  <SelectValue placeholder="Standard rate" />
                </SelectTrigger>
                <SelectContent>
                  {activeProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} — {(product.interestRate * 100).toFixed(2)}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Custom rate"
              htmlFor="customRate"
              optional
              description="Promotional override, e.g. 25 or 0. Max 30%."
            >
              <div className="relative">
                <Input
                  id="customRate"
                  type="number"
                  step="0.01"
                  max="30"
                  inputMode="decimal"
                  placeholder="—"
                  value={customRate}
                  onChange={(event) => setCustomRate(event.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </FormField>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">Quote preview</span>
              {quoting ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>
            {quote ? (
              <dl className="grid grid-cols-2 gap-y-1.5">
                <dt className="text-muted-foreground">Loan amount</dt>
                <dd className="text-right tabular-nums">{formatNad(quote.principalCents)}</dd>
                {quote.stampDutyCents > 0 ? (
                  <>
                    <dt className="text-muted-foreground">Stamp duty</dt>
                    <dd className="text-right tabular-nums">{formatNad(quote.stampDutyCents)}</dd>
                  </>
                ) : null}
                {quote.insuranceCents > 0 ? (
                  <>
                    <dt className="text-muted-foreground">Insurance</dt>
                    <dd className="text-right tabular-nums">{formatNad(quote.insuranceCents)}</dd>
                  </>
                ) : null}
                {quote.namfisaLevyCents > 0 ? (
                  <>
                    <dt className="text-muted-foreground">NAMFISA levy</dt>
                    <dd className="text-right tabular-nums">{formatNad(quote.namfisaLevyCents)}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Principal debt</dt>
                <dd className="text-right tabular-nums">{formatNad(quote.principalDebtCents)}</dd>
                <dt className="text-muted-foreground">
                  Interest ({(quote.interestRate * 100).toFixed(2)}%)
                </dt>
                <dd className="text-right tabular-nums">{formatNad(quote.financeChargeCents)}</dd>
                {quote.bankChargesCents > 0 ? (
                  <>
                    <dt className="text-muted-foreground">Bank charges</dt>
                    <dd className="text-right tabular-nums">{formatNad(quote.bankChargesCents)}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Instalment</dt>
                <dd className="text-right tabular-nums">{formatNad(quote.instalmentCents)}</dd>
                <dt className="font-medium">Total repayable</dt>
                <dd className="text-right font-medium tabular-nums">{formatNad(quote.totalCents)}</dd>
                {quote.termMonths > 1 ? (
                  <dd className="col-span-2 mt-1 text-xs text-muted-foreground">
                    Interest is {(quote.interestRate * 100).toFixed(0)}% for month 1, then compounds
                    at 5%/month for the remaining {quote.termMonths - 1} month
                    {quote.termMonths - 1 === 1 ? '' : 's'}.
                  </dd>
                ) : null}
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
