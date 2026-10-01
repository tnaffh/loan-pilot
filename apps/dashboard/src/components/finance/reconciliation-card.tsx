'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { can, formatNad, fromCents } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { FormField } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { bumpRevalidation } from '@/lib/revalidate';
import { formatDate } from '@/lib/format';
import type { OverviewStats } from '@/lib/types';

type LenderStats = Extract<OverviewStats, { kind: 'lender' }>;

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * How "Available to lend" is built up, and how far it sits from the bank.
 *
 * The figure is opening balance + every recorded inflow − every recorded
 * outflow, so it only equals the bank when the opening balance is true and every
 * movement has been captured. This panel shows each line, lets the lender record
 * the bank balance they actually see, and names what commonly explains the
 * difference, so the gap is investigated rather than plugged into the opening
 * balance without anyone noticing.
 */
export const ReconciliationCard = ({ lender }: { lender: LenderStats }) => {
  const { user, token } = useAuth();
  const canRecordBank = Boolean(user && can(user, 'finance:write'));
  const canSetOpening = Boolean(user && can(user, 'settings:write'));

  const opening = lender.openingBalance ?? 0;
  const available = lender.availableBalance ?? 0;
  const lines: { label: string; value: number; sign: '+' | '−'; hint?: string }[] = [
    {
      label: 'Opening balance',
      value: opening,
      sign: '+',
      hint: 'The cash before the first recorded movement, set under Finance',
    },
    { label: 'Capital injected', value: lender.invested ?? 0, sign: '+' },
    { label: 'Repayments collected', value: lender.collected ?? 0, sign: '+' },
    { label: 'Other income', value: lender.income ?? 0, sign: '+' },
    { label: 'Loans paid out', value: lender.disbursed ?? 0, sign: '−' },
    { label: 'Operating expenses', value: lender.expenses ?? 0, sign: '−' },
    { label: 'Owner drawings', value: lender.drawings ?? 0, sign: '−' },
  ];

  const [bankValue, setBankValue] = useState(
    lender.bankBalance != null ? fromCents(lender.bankBalance).toString() : '',
  );
  const [bankDate, setBankDate] = useState(lender.bankBalanceAt?.slice(0, 10) ?? today());
  const [savingBank, setSavingBank] = useState(false);
  const [confirmingOpening, setConfirmingOpening] = useState(false);
  const [savingOpening, setSavingOpening] = useState(false);

  const recorded = lender.bankBalance != null ? lender.bankBalance : null;
  const difference = recorded != null ? available - recorded : null;
  const suggestedOpening = difference != null ? opening - difference : null;

  const saveBank = async () => {
    setSavingBank(true);
    try {
      await apiFetch('/settings/bank-balance', {
        method: 'PATCH',
        body: { bankBalance: Number(bankValue), bankBalanceAt: bankDate },
        token,
      });
      toast.success('Bank balance recorded');
      bumpRevalidation();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setSavingBank(false);
    }
  };

  const applyOpening = async () => {
    if (suggestedOpening == null) return;
    setSavingOpening(true);
    try {
      await apiFetch('/settings/opening-balance', {
        method: 'PATCH',
        body: { openingBalance: fromCents(suggestedOpening) },
        token,
      });
      toast.success('Opening balance updated');
      bumpRevalidation();
      setConfirmingOpening(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setSavingOpening(false);
    }
  };

  const unreleased = lender.unreleased;
  const undated = lender.undated;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>How Available to lend is built</CardTitle>
          <CardDescription>
            Every recorded movement since the opening balance. It equals the bank only when the
            opening balance is right and nothing is missing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.label}>
                  <TableCell className="text-muted-foreground">
                    {line.label}
                    {line.hint ? <p className="text-xs">{line.hint}</p> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="mr-1 text-muted-foreground">{line.sign}</span>
                    {formatNad(line.value)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Available to lend</TableCell>
                <TableCell className="text-right tabular-nums">{formatNad(available)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Against the bank</CardTitle>
          <CardDescription>
            Record the balance you see on the account and the day it was true.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canRecordBank ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <FormField label="Bank balance (N$)" htmlFor="bank-balance">
                <Input
                  id="bank-balance"
                  type="number"
                  step="0.01"
                  value={bankValue}
                  onChange={(event) => setBankValue(event.target.value)}
                />
              </FormField>
              <FormField label="As at" htmlFor="bank-date">
                <Input
                  id="bank-date"
                  type="date"
                  value={bankDate}
                  onChange={(event) => setBankDate(event.target.value)}
                />
              </FormField>
              <Button onClick={saveBank} disabled={savingBank || bankValue === ''}>
                {savingBank ? <Loader2 className="animate-spin" /> : null}
                Record
              </Button>
            </div>
          ) : null}

          {recorded != null && difference != null ? (
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Bank balance
                    <p className="text-xs">as at {formatDate(lender.bankBalanceAt ?? null)}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNad(recorded)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Available to lend</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNad(available)}</TableCell>
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell>
                    Difference
                    <p className="text-xs font-normal text-muted-foreground">
                      {difference === 0
                        ? 'The books agree with the bank.'
                        : difference > 0
                          ? 'LoanPilot shows more cash than the bank.'
                          : 'LoanPilot shows less cash than the bank.'}
                    </p>
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${difference === 0 ? '' : 'text-destructive'}`}
                  >
                    {formatNad(Math.abs(difference))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No bank balance recorded yet.</p>
          )}

          <div className="space-y-2 text-sm">
            <p className="font-medium">What usually explains a difference</p>
            <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
              {unreleased && unreleased.count > 0 ? (
                <li>
                  {unreleased.count} loan{unreleased.count === 1 ? '' : 's'} totalling{' '}
                  {formatNad(unreleased.principal)} {unreleased.count === 1 ? 'is' : 'are'}{' '}
                  approved but not marked as paid out. If that money is still in the account,
                  LoanPilot understates cash by up to that amount. Mark them released on the loan
                  pages.
                </li>
              ) : null}
              {undated && undated.count > 0 ? (
                <li>
                  {undated.count} undated entr{undated.count === 1 ? 'y' : 'ies'} (capital{' '}
                  {formatNad(undated.capital)}, costs {formatNad(undated.costs)}, income{' '}
                  {formatNad(undated.income)}) are counted from the start of the records. Give them
                  dates to place them in the right month.
                </li>
              ) : null}
              <li>Costs, drawings or transfers paid from the account but not yet captured here.</li>
              <li>
                Repayments recorded before the debit order cleared, or cash collected but not yet
                banked.
              </li>
              <li>
                The opening balance is a baseline, not a bank statement. Setting it to force a match
                hides whatever is unrecorded, so capture the missing movements first.
              </li>
            </ul>
          </div>

          {canSetOpening && difference != null && difference !== 0 && suggestedOpening != null ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">
                Setting the opening balance to {formatNad(suggestedOpening)} would make the books
                equal the bank as at {formatDate(lender.bankBalanceAt ?? null)}.
              </span>
              <Button size="sm" variant="outline" onClick={() => setConfirmingOpening(true)}>
                Set opening balance
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={confirmingOpening} onOpenChange={setConfirmingOpening}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set the opening balance to match the bank?</DialogTitle>
            <DialogDescription>
              The opening balance changes from {formatNad(opening)} to{' '}
              {formatNad(suggestedOpening ?? 0)}. Every month&apos;s cash position in the reports
              moves by the same amount. Anything unrecorded on the account stays unrecorded; this
              only hides it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmingOpening(false)}
              disabled={savingOpening}
            >
              Cancel
            </Button>
            <Button onClick={applyOpening} disabled={savingOpening}>
              {savingOpening ? <Loader2 className="animate-spin" /> : null}
              Set opening balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
