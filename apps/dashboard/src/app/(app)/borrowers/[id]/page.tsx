'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LoanStatus, formatNad } from '@loan-pilot/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { InitialsAvatar } from '@/components/initials-avatar';
import { Kv } from '@/components/kv';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { BorrowerDetail } from '@/lib/types';

const BorrowerDetailPage = () => {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useApi<BorrowerDetail>(
    params.id ? `/borrowers/${params.id}` : null,
  );

  if (loading || !data) {
    return (
      <div>
        <PageHeader title="Borrower" />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Skeleton className="h-64 w-full rounded-xl" />
        )}
      </div>
    );
  }

  const activeLoan = data.loans.find(
    (loan) => loan.status === LoanStatus.Active || loan.status === LoanStatus.Arrears,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <InitialsAvatar name={`${data.firstName} ${data.lastName}`} className="size-12" />
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {data.firstName} {data.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">Borrower since {formatDate(data.since)}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kv label="ID number" value={data.idNumber} />
            <Kv label="Phone" value={data.phone} />
            <Kv label="Email" value={data.email} />
            <Kv label="Address" value={data.address} />
            <Kv label="Employer" value={data.employer} />
            <Kv label="Occupation" value={data.occupation} />
            <Kv label="Monthly income" value={formatNad(data.monthlyIncome)} />
            <Kv label="Bank" value={`${data.bank} (${data.accountType})`} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loan history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Disbursed</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell>
                    <Link href={`/loans/${loan.id}`} className="hover:underline">
                      <TypeChip type={loan.type} />
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNad(loan.principal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNad(loan.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNad(loan.balance)}</TableCell>
                  <TableCell>{formatDate(loan.disbursedAt)}</TableCell>
                  <TableCell>
                    <StatusBadge value={loan.status} />
                  </TableCell>
                </TableRow>
              ))}
              {data.loans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No loans yet
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {activeLoan ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Active loan schedule — {formatNad(activeLoan.instalment)} / month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeLoan.schedule.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.number}</TableCell>
                    <TableCell>{formatDate(item.dueAt)}</TableCell>
                    <TableCell className="text-right">{formatNad(item.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge value={item.status} />
                    </TableCell>
                    <TableCell>{formatDate(item.paidAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default BorrowerDetailPage;
