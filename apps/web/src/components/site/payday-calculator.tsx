'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LoanType, formatNad, toCents } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { computeQuote, fetchPricingConfig, type PricingConfig } from '@/lib/pricing';

export const PaydayCalculator = () => {
  const [amount, setAmount] = useState(5000);
  const [config, setConfig] = useState<PricingConfig | null>(null);

  useEffect(() => {
    fetchPricingConfig().then(setConfig);
  }, []);

  // Payday loans are repaid in a single month.
  const result = computeQuote(config, { amount, termMonths: 1, type: LoanType.Payday });

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Payday loan calculator</CardTitle>
        <p className="text-sm text-muted-foreground">
          Borrow now, repay in one month. A flat 30% finance charge — shown upfront.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-foreground/70">Loan amount</span>
            <span className="font-heading text-xl font-semibold">{formatNad(toCents(amount))}</span>
          </div>
          <input
            type="range"
            min={500}
            max={15000}
            step={500}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="w-full accent-primary"
            aria-label="Loan amount"
          />
        </div>

        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-foreground/70">Repayment term</span>
          <span className="font-heading text-xl font-semibold">1 month</span>
        </div>

        <div className="rounded-xl bg-secondary p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-secondary-foreground">Total to repay</span>
            <span className="font-heading text-3xl font-bold text-secondary-foreground">
              {formatNad(result.totalCents)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[13px] text-muted-foreground">
            <span>
              Per month:{' '}
              <strong className="text-foreground">{formatNad(result.instalmentCents)}</strong>
            </span>
            <span>
              Finance charge:{' '}
              <strong className="text-foreground">{formatNad(result.financeChargeCents)}</strong>
            </span>
          </div>
        </div>

        <Button className="w-full" render={<Link href="/apply" />}>
          Start my application
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Figures are estimates for illustration only and do not constitute an offer of credit.
          Actual amounts, fees and terms are confirmed after an affordability assessment, in line
          with NAMFISA requirements. You always keep at least 50% of your income.
        </p>
      </CardContent>
    </Card>
  );
};
