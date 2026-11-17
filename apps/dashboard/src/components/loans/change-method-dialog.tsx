'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Loader2 } from 'lucide-react';
import {
  INTEREST_METHOD_HINT,
  INTEREST_METHOD_LABEL,
  InterestMethod,
  MAX_TERM_MONTHS,
  RENEWAL_BASIS_LABEL,
  RenewalBasis,
  formatNad,
  type ChangeLoanMethodInput,
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
import { formatDate } from '@/lib/format';
import { FormField } from '@/components/form-field';
import type { LoanDetail } from '@/lib/types';

/** What the loan would owe under the chosen method, next to what it owes now. */
interface MethodChangePreview {
  termMonths: number;
  instalment: number;
  total: number;
  balance: number;
  nextDueAt: string | null;
  renewals: number;
  renewalCharges: number;
  defaultInterest: number;
  payoff: number;
  current: { total: number; balance: number; defaultInterest: number; payoff: number };
}

interface MethodSettings {
  bonRate: number;
  maxLongTermMonths: number;
}

const isInterestMethod = (value: string): value is InterestMethod =>
  Object.values<string>(InterestMethod).includes(value);

const isRenewalBasis = (value: string): value is RenewalBasis =>
  Object.values<string>(RenewalBasis).includes(value);

/** A fraction as a percentage with up to two decimals (0.155 → "15.5"). */
const percent = (fraction: number): string => (Math.round(fraction * 10000) / 100).toString();

const Compare = ({ label, from, to }: { label: string; from: string; to: string }) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <span className="text-muted-foreground">{label}</span>
    <span className="flex items-center gap-2 tabular-nums">
      <span className="text-muted-foreground">{from}</span>
      <ArrowRight className="size-3 text-muted-foreground" />
      <span className="font-medium">{to}</span>
    </span>
  </div>
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: LoanDetail;
}

export const ChangeMethodDialog = ({ open, onOpenChange, loan }: Props) => {
  const { token } = useAuth();
  const { data: settings } = useApi<MethodSettings>(open ? '/settings/fees' : null);
  const [method, setMethod] = useState<InterestMethod>(loan.interestMethod);
  const [basis, setBasis] = useState<RenewalBasis>(RenewalBasis.Principal);
  const [rate, setRate] = useState('');
  const [term, setTerm] = useState('');
  const [margin, setMargin] = useState('');
  // The latest recalculation, tagged with the inputs it was worked out for.
  const [result, setResult] = useState<{
    key: string;
    preview: MethodChangePreview | null;
    error: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Seed the form from the loan each time the dialog opens (or the loan changes).
  const seedKey = open ? `${loan.id}:${loan.updatedAt}` : null;

  if (seedKey !== seededFor) {
    setSeededFor(seedKey);

    if (open) {
      setMethod(loan.interestMethod);
      setBasis(loan.renewalBasis ?? RenewalBasis.Principal);
      setRate(percent(loan.interestRate));
      setTerm(String(loan.termMonths));
      setMargin(loan.marginRate !== null ? percent(loan.marginRate) : '');
      setResult(null);
    }
  }

  const termLoan = method === InterestMethod.TermLoan;
  const renewing = method === InterestMethod.MonthlyRenewal;
  // A loan already on a term loan keeps the BoN rate it was priced at.
  const bonRate =
    loan.interestMethod === InterestMethod.TermLoan && loan.bonRate !== null
      ? loan.bonRate
      : (settings?.bonRate ?? 0);
  const maxTerm = termLoan ? (settings?.maxLongTermMonths ?? 60) : MAX_TERM_MONTHS;

  const body: ChangeLoanMethodInput = {
    method,
    renewalBasis: renewing ? basis : undefined,
    interestRate: termLoan || rate === '' ? undefined : Number(rate) / 100,
    termMonths: renewing || term === '' ? undefined : Number(term),
    marginRate: termLoan ? Number(margin || 0) / 100 : undefined,
  };
  const bodyKey = JSON.stringify(body);

  // Live preview (debounced) of the recalculated loan; nothing is saved by it.
  useEffect(() => {
    if (!open || !token) return;

    const handle = setTimeout(() => {
      apiFetch<MethodChangePreview>(`/loans/${loan.id}/method/preview`, {
        method: 'POST',
        body: JSON.parse(bodyKey),
        token,
      })
        .then((next) => setResult({ key: bodyKey, preview: next, error: null }))
        .catch((error: unknown) =>
          setResult({
            key: bodyKey,
            preview: null,
            error: error instanceof ApiError ? error.message : 'Could not recalculate',
          }),
        );
    }, 300);

    return () => clearTimeout(handle);
  }, [open, token, loan.id, bodyKey]);

  // A result for earlier inputs is stale: show it as still recalculating.
  const loading = result?.key !== bodyKey;
  const preview = loading ? null : (result?.preview ?? null);
  const previewError = loading ? null : (result?.error ?? null);

  const save = async () => {
    setSaving(true);

    try {
      await apiFetch(`/loans/${loan.id}/method`, { method: 'PATCH', body, token });
      toast.success(`Loan recalculated as ${INTEREST_METHOD_LABEL[method]}`);
      bumpRevalidation();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change calculation method</DialogTitle>
          <DialogDescription>
            The loan is recalculated from the day it was disbursed, keeping its amount, fees and
            payments. You can change it back at any time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Method" htmlFor="cm-method" description={INTEREST_METHOD_HINT[method]}>
            <Select
              value={method}
              onValueChange={(value) => {
                if (value && isInterestMethod(value)) setMethod(value);
              }}
            >
              <SelectTrigger id="cm-method" className="w-full">
                <SelectValue>{INTEREST_METHOD_LABEL[method]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.values(InterestMethod).map((value) => (
                  <SelectItem key={value} value={value}>
                    {INTEREST_METHOD_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            {termLoan ? (
              <FormField
                label="Margin over the BoN rate"
                htmlFor="cm-margin"
                description={`BoN ${percent(bonRate)}% + margin = ${percent(
                  bonRate + Number(margin || 0) / 100,
                )}% a year.`}
              >
                <div className="relative">
                  <Input
                    id="cm-margin"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    value={margin}
                    onChange={(event) => setMargin(event.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </FormField>
            ) : (
              <FormField
                label={renewing ? 'Monthly rate' : 'Finance rate'}
                htmlFor="cm-rate"
                description={
                  renewing ? 'Charged in month 1 and at each renewal. Max 30%.' : 'Max 30%.'
                }
              >
                <div className="relative">
                  <Input
                    id="cm-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="30"
                    inputMode="decimal"
                    value={rate}
                    onChange={(event) => setRate(event.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </FormField>
            )}
            {renewing ? (
              <FormField
                label="Renewal charge"
                htmlFor="cm-basis"
                description="What the rate is charged on each month the loan renews."
              >
                <Select
                  value={basis}
                  onValueChange={(value) => {
                    if (value && isRenewalBasis(value)) setBasis(value);
                  }}
                >
                  <SelectTrigger id="cm-basis" className="w-full">
                    <SelectValue>{RENEWAL_BASIS_LABEL[basis]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(RenewalBasis).map((value) => (
                      <SelectItem key={value} value={value}>
                        {RENEWAL_BASIS_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ) : (
              <FormField
                label="Term (months)"
                htmlFor="cm-term"
                description={`1 to ${maxTerm} months.`}
              >
                <Input
                  id="cm-term"
                  type="number"
                  step="1"
                  min="1"
                  max={maxTerm}
                  inputMode="numeric"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                />
              </FormField>
            )}
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">Now → after the change</span>
              {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>
            {preview ? (
              <>
                <Compare
                  label="Total repayable"
                  from={formatNad(preview.current.total)}
                  to={formatNad(preview.total)}
                />
                <Compare
                  label="Balance"
                  from={formatNad(preview.current.balance)}
                  to={formatNad(preview.balance)}
                />
                <Compare
                  label="Default interest"
                  from={formatNad(preview.current.defaultInterest)}
                  to={formatNad(preview.defaultInterest)}
                />
                <Compare
                  label="Owed today"
                  from={formatNad(preview.current.payoff)}
                  to={formatNad(preview.payoff)}
                />
                <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                  {renewing
                    ? `${preview.renewals} renewal${preview.renewals === 1 ? '' : 's'} so far ` +
                      `(${formatNad(preview.renewalCharges)}). `
                    : `${preview.termMonths} instalment${preview.termMonths === 1 ? '' : 's'} of ` +
                      `${formatNad(preview.instalment)}. `}
                  {preview.nextDueAt ? `Next due ${formatDate(preview.nextDueAt)}.` : ''}
                </p>
              </>
            ) : (
              <p className={previewError ? 'text-destructive' : 'text-muted-foreground'}>
                {previewError ?? 'Recalculating…'}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading || !preview}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Recalculate loan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
