'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ReportDataQuality } from '@loan-pilot/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/use-api';

/**
 * The backlog behind the gender splits.
 *
 * Gender is captured at intake from now on, but every borrower taken on before
 * that — and everything imported from the old register — has none. Parts 15 and
 * 7.2 stay incomplete until this list is worked through, so it links straight to
 * each borrower rather than just reporting a number.
 */
export const GenderBackfillCard = () => {
  const { data } = useApi<ReportDataQuality>('/reports/data-quality');

  if (!data || data.borrowersMissingGender === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Borrowers without a gender on file</CardTitle>
        <CardDescription>
          {data.borrowersMissingGender} of {data.borrowersTotal} borrowers. NAMFISA splits Parts 15
          and 7.2 by gender, so these sit in the unallocated row until each is updated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {data.sample.map((borrower) => (
            <li key={borrower.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{borrower.name}</p>
                <p className="truncate text-xs text-muted-foreground">{borrower.idNumber}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                render={<Link href={`/borrowers/${borrower.id}`} />}
              >
                Update <ArrowRight className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
        {data.borrowersMissingGender > data.sample.length ? (
          <p className="pt-3 text-xs text-muted-foreground">
            Showing the {data.sample.length} most recent of {data.borrowersMissingGender}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};
