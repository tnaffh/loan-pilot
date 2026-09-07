'use client';

import { Receipt } from 'lucide-react';
import { fromCents } from '@loan-pilot/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LoanDetail } from '@/lib/types';

/**
 * Line-by-line derivation of what the borrower owes, so staff can answer "why is
 * my balance this much?" without doing the arithmetic by hand.
 *
 * The two figures that surprise borrowers are the fees folded into the financed
 * amount (they earn the finance charge too) and, on multi-month loans, the growth
 * applied for months 2 onwards — so both get their own line rather than being
 * buried inside a single finance-charge total.
 *
 * Amounts show cents here, unlike `formatNad` elsewhere in the app: this card exists
 * to be read line by line against a balance, and rounding to whole Rand makes the
 * rows visibly fail to add up (the two charge lines alone drift by a Rand).
 */

const exact = (cents: number): string =>
  `N$ ${fromCents(cents).toLocaleString('en-NA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

interface RowProps {
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
  readonly negative?: boolean;
  readonly emphasis?: boolean;
  readonly divider?: boolean;
}

const Row = ({ label, value, hint, negative, emphasis, divider }: RowProps) => (
  <div
    className={[
      'flex items-baseline justify-between gap-4 py-1',
      divider ? 'mt-1 border-t pt-2' : '',
      emphasis ? 'font-medium text-foreground' : 'text-muted-foreground',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <span>
      {label}
      {hint ? <span className="ml-1 text-xs text-muted-foreground">{hint}</span> : null}
    </span>
    <span className={`tabular-nums ${emphasis ? 'text-foreground' : ''}`}>
      {negative ? `− ${exact(value)}` : exact(value)}
    </span>
  </div>
);

export const LoanPriceBreakdown = ({ loan }: { readonly loan: LoanDetail }) => {
  // Everything here is derived from the stored figures, so the card always
  // reconciles to the loan exactly as priced — no re-quoting at render time.
  const insurance = loan.insurance ?? 0;
  const amountFinanced = loan.principal + loan.namfisaLevy + loan.stampDuty + insurance;
  const monthOneCharge = Math.round(amountFinanced * loan.interestRate);
  // Whatever the finance charge is beyond month 1 is the multi-month compounding.
  const termGrowth = loan.total - loan.bankCharges - amountFinanced - monthOneCharge;
  const paidToDate = loan.total - loan.balance;
  const ratePercent = Math.round(loan.interestRate * 1000) / 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4 text-muted-foreground" /> How this balance is made up
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <Row label="Loan amount" value={loan.principal} />
        <Row label="NAMFISA levy" value={loan.namfisaLevy} />
        <Row label="Stamp duty" value={loan.stampDuty} />
        {insurance > 0 ? <Row label="Insurance" value={insurance} /> : null}
        <Row label="Amount financed" value={amountFinanced} emphasis divider />

        <Row
          label="Finance charge"
          hint={`${ratePercent}% in month 1`}
          value={monthOneCharge}
        />
        {termGrowth > 0 ? (
          <Row
            label="Growth"
            hint={`months 2–${loan.termMonths}`}
            value={termGrowth}
          />
        ) : null}
        {loan.bankCharges > 0 ? <Row label="Bank charges" value={loan.bankCharges} /> : null}
        <Row
          label="Total repayable"
          value={loan.total}
          hint={`${loan.instalmentsTotal} × ${exact(loan.instalment)}`}
          emphasis
          divider
        />

        <Row
          label="Paid to date"
          hint={loan.instalmentsPaid > 0 ? `${loan.instalmentsPaid} instalment(s)` : undefined}
          value={paidToDate}
          negative
        />
        <Row label="Balance" value={loan.balance} emphasis divider />

        {loan.defaultInterest > 0 ? (
          <>
            <Row label="Default interest on overdue instalments" value={loan.defaultInterest} />
            <Row label="Payoff today" value={loan.payoff} emphasis divider />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};
