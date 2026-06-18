'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { formatNad } from '@loan-pilot/domain';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { Kv } from '@/components/kv';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { BorrowerDetail } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  borrowerId: string | null;
  onNewLoan: (borrowerId: string) => void;
  onOpenLoan: (loanId: string) => void;
}

export const BorrowerQuickViewSheet = ({
  open,
  onOpenChange,
  borrowerId,
  onNewLoan,
  onOpenLoan,
}: Props) => {
  const { data } = useApi<BorrowerDetail>(open && borrowerId ? `/borrowers/${borrowerId}` : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {!data ? (
          <>
            <SheetHeader>
              <SheetTitle>Borrower</SheetTitle>
            </SheetHeader>
            <div className="px-4">
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>
                {data.firstName} {data.lastName}
              </SheetTitle>
              <SheetDescription>
                {data.idNumber} · since {formatDate(data.since)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                <Kv label="Phone" value={data.phone} />
                <Kv label="Monthly income" value={formatNad(data.monthlyIncome)} />
                <Kv label="Employer" value={data.employer} />
                <Kv label="Occupation" value={data.occupation} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onNewLoan(data.id)}>
                  New loan
                </Button>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Loans ({data.loans.length})
                </div>
                <ul className="space-y-1.5">
                  {data.loans.map((loan) => (
                    <li key={loan.id}>
                      <button
                        type="button"
                        onClick={() => onOpenLoan(loan.id)}
                        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="flex items-center gap-2">
                          <TypeChip type={loan.type} />
                          <span className="tabular-nums">{formatNad(loan.balance)}</span>
                        </span>
                        <StatusBadge value={loan.status} />
                      </button>
                    </li>
                  ))}
                  {data.loans.length === 0 ? (
                    <li className="text-sm text-muted-foreground">No loans yet.</li>
                  ) : null}
                </ul>
              </div>

              <Link
                href={`/borrowers/${data.id}`}
                className={buttonVariants({ variant: 'outline', className: 'w-full' })}
              >
                Open full profile
                <ArrowUpRight />
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
