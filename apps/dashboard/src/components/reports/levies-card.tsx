'use client';

import { formatNad } from '@loan-pilot/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApi } from '@/lib/use-api';

interface LevyYear {
  year: number;
  loanCount: number;
  levyCents: number;
  stampDutyCents: number;
}

interface LevyReport {
  years: LevyYear[];
  totalLevyCents: number;
  totalStampDutyCents: number;
}

/**
 * NAMFISA levies collected per calendar year, for the annual remittance.
 * Moved here from Rates & fees so every regulatory figure lives in one place;
 * that page is now purely configuration.
 */
export const LeviesCard = () => {
  const { data, loading } = useApi<LevyReport>('/settings/levies');

  return (
    <Card>
      <CardHeader>
        <CardTitle>NAMFISA levies collected</CardTitle>
        <CardDescription>
          Levies charged on loans, grouped by the year they were advanced. These are payable to
          NAMFISA annually. Cancelled loans are excluded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (data?.years.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No levies recorded yet. They accrue as loans with a NAMFISA levy are disbursed.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Loans</TableHead>
                <TableHead className="text-right">NAMFISA levy</TableHead>
                <TableHead className="text-right">Stamp duty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.years ?? []).map((row) => (
                <TableRow key={row.year}>
                  <TableCell className="font-medium">{row.year}</TableCell>
                  <TableCell className="text-right">{row.loanCount}</TableCell>
                  <TableCell className="text-right">{formatNad(row.levyCents)}</TableCell>
                  <TableCell className="text-right">{formatNad(row.stampDutyCents)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right" />
                <TableCell className="text-right">{formatNad(data?.totalLevyCents ?? 0)}</TableCell>
                <TableCell className="text-right">
                  {formatNad(data?.totalStampDutyCents ?? 0)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
