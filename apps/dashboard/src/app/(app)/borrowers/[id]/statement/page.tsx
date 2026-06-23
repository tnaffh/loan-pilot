'use client';

import { useParams } from 'next/navigation';
import { Loader2, Printer } from 'lucide-react';
import { formatNad } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { BorrowerStatement } from '@/lib/types';

// On print, hide everything except the statement subtree (robust against the
// dashboard chrome around it).
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #statement-print, #statement-print * { visibility: visible; }
  #statement-print { position: absolute; inset: 0; margin: 0; padding: 24px; }
  .no-print { display: none !important; }
}
`;

const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const StatementPage = () => {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useApi<BorrowerStatement>(
    params.id ? `/borrowers/${params.id}/statement-letter` : null,
  );

  if (loading || !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print mb-4 flex justify-end">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save as PDF
        </Button>
      </div>

      <div
        id="statement-print"
        className="mx-auto max-w-3xl rounded-lg border bg-white p-10 text-sm text-black shadow-sm"
      >
        {/* Letterhead */}
        <div
          className="flex items-center justify-between border-b-2 pb-4"
          style={{ borderColor: data.lender.accent }}
        >
          <div>
            <h1 className="text-2xl font-bold" style={{ color: data.lender.accent }}>
              {data.lender.name}
            </h1>
            {data.lender.town ? <p className="text-gray-600">{data.lender.town}, Namibia</p> : null}
          </div>
          {data.lender.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.lender.logoUrl} alt={data.lender.short} className="h-14 w-auto" />
          ) : (
            <span className="text-xl font-semibold text-gray-400">{data.lender.short}</span>
          )}
        </div>

        <p className="mt-6 text-right text-gray-600">{formatDate(data.generatedAt)}</p>

        <h2 className="mt-6 text-base font-semibold uppercase tracking-wide">
          Statement of account
        </h2>

        {/* Borrower block */}
        <div className="mt-4 space-y-0.5">
          <p>
            <span className="text-gray-500">Name: </span>
            <span className="font-medium">{data.borrower.name}</span>
          </p>
          <p>
            <span className="text-gray-500">ID number: </span>
            {data.borrower.idNumber}
          </p>
          {data.borrower.phone ? (
            <p>
              <span className="text-gray-500">Phone: </span>
              {data.borrower.phone}
            </p>
          ) : null}
          {data.borrower.address ? (
            <p>
              <span className="text-gray-500">Address: </span>
              {data.borrower.address}
            </p>
          ) : null}
        </div>

        <p className="mt-6">
          This letter confirms the loan account history of the above-named client with{' '}
          {data.lender.name} as at {formatDate(data.generatedAt)}.
        </p>

        {/* Loans table */}
        <table className="mt-4 w-full border-collapse text-left">
          <thead>
            <tr className="border-b" style={{ borderColor: data.lender.accent }}>
              <th className="py-2">Loan</th>
              <th className="py-2">Disbursed</th>
              <th className="py-2 text-right">Principal</th>
              <th className="py-2 text-right">Balance / payoff</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.loans.map((loan) => (
              <tr key={loan.id} className="border-b border-gray-200">
                <td className="py-2">{titleCase(loan.type)}</td>
                <td className="py-2">{formatDate(loan.disbursedAt)}</td>
                <td className="py-2 text-right tabular-nums">{formatNad(loan.principal)}</td>
                <td className="py-2 text-right tabular-nums">{formatNad(loan.payoff)}</td>
                <td className="py-2">{titleCase(loan.status.replace('_', ' '))}</td>
              </tr>
            ))}
            {data.loans.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-center text-gray-500">
                  No loans on record.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {/* Outcome */}
        <div className="mt-6 rounded-md bg-gray-50 p-4">
          {data.hasOutstanding ? (
            <p className="text-base font-semibold">
              Total outstanding: {formatNad(data.totals.outstanding)}
            </p>
          ) : (
            <p className="text-base font-semibold">
              No outstanding debt — this client&apos;s account is settled.
            </p>
          )}
          <p className="mt-1 text-gray-600">
            Lifetime borrowed {formatNad(data.totals.lifetimeBorrowed)} across{' '}
            {data.totals.openLoans + data.totals.settledLoans} loan
            {data.totals.openLoans + data.totals.settledLoans === 1 ? '' : 's'} (
            {data.totals.settledLoans} settled).
          </p>
        </div>

        {/* Signature */}
        <div className="mt-12 flex justify-between">
          <div>
            <div className="w-56 border-t border-gray-400 pt-1 text-gray-600">
              Authorised signature
            </div>
          </div>
          <div>
            <div className="w-40 border-t border-gray-400 pt-1 text-gray-600">Date</div>
          </div>
        </div>

        <p className="mt-8 text-xs text-gray-400">
          Generated by {data.lender.name} on {formatDate(data.generatedAt)}. This is a
          system-generated statement of the client&apos;s account.
        </p>
      </div>
    </div>
  );
};

export default StatementPage;
