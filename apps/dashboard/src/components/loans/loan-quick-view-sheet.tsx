'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { LoanStatus, formatNad } from '@loan-pilot/domain';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { Kv } from '@/components/kv';
import { ActivityTimeline } from '@/components/activity-timeline';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { LoanDetail } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string | null;
  onRecordPayment: (loan: LoanDetail) => void;
  onSettle: (loan: LoanDetail) => void;
  onWriteOff: (loan: LoanDetail) => void;
}

export const LoanQuickViewSheet = ({
  open,
  onOpenChange,
  loanId,
  onRecordPayment,
  onSettle,
  onWriteOff,
}: Props) => {
  const { data } = useApi<LoanDetail>(open && loanId ? `/loans/${loanId}` : null);
  const isOpenLoan =
    data?.status === LoanStatus.Active ||
    data?.status === LoanStatus.Arrears ||
    data?.status === LoanStatus.PartlyPaid;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {!data ? (
          <>
            <SheetHeader>
              <SheetTitle>Loan</SheetTitle>
            </SheetHeader>
            <div className="px-4">
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {data.borrower.firstName} {data.borrower.lastName}
                <StatusBadge value={data.status} />
              </SheetTitle>
              <SheetDescription>
                <TypeChip type={data.type} /> · disbursed {formatDate(data.disbursedAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                <Kv label="Balance" value={formatNad(data.balance)} />
                <Kv label="Total repayable" value={formatNad(data.total)} />
                <Kv label="Instalment" value={formatNad(data.instalment)} />
                <Kv label="Next due" value={formatDate(data.nextDueAt)} />
              </div>

              <div className="space-y-1.5">
                <Progress
                  value={
                    data.instalmentsTotal > 0
                      ? (data.instalmentsPaid / data.instalmentsTotal) * 100
                      : 0
                  }
                  className="h-[7px]"
                />
                <p className="text-xs text-muted-foreground">
                  {data.instalmentsPaid} of {data.instalmentsTotal} instalments paid
                </p>
              </div>

              {isOpenLoan ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onRecordPayment(data)}>
                    Record payment
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onSettle(data)}>
                    Settle
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => onWriteOff(data)}
                  >
                    Write off
                  </Button>
                </div>
              ) : null}

              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Activity</div>
                <ActivityTimeline events={data.activity} />
              </div>

              <Link href={`/loans/${data.id}`} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
                Open full loan
                <ArrowUpRight />
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
