/**
 * Repair schedule progress on loans whose payments were recorded before it was
 * derived from payment history.
 *
 * Recording a payment used to update only balance and status, so those loans kept
 * every instalment flagged `due` with `instalmentsPaid` at 0 — which matters
 * because arrears are assessed live off the schedule, so a paid instalment reads
 * as overdue and starts accruing default interest once it is a full month past
 * due. This applies the same pure derivation the API now uses at runtime.
 *
 * Dry run by default; pass --apply to write.
 *
 *   pnpm --filter @loan-pilot/api exec ts-node prisma/backfill-schedule-progress.ts
 *   pnpm --filter @loan-pilot/api exec ts-node prisma/backfill-schedule-progress.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { formatNad } from '@loan-pilot/domain';
import { deriveScheduleProgress } from '../src/payments/schedule-progress';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const main = async (): Promise<void> => {
  const loans = await prisma.loan.findMany({
    where: { payments: { some: {} } },
    select: {
      id: true,
      instalmentsPaid: true,
      instalmentsTotal: true,
      nextDueAt: true,
      daysLate: true,
      borrower: { select: { firstName: true, lastName: true } },
      payments: { orderBy: { paidAt: 'asc' }, select: { amount: true, paidAt: true } },
      schedule: { orderBy: { number: 'asc' } },
    },
  });

  // Resolve every loan first, then report and write — keeps the walk free of
  // mutable counters and makes the dry run and the apply path identical.
  const pending = loans
    .filter((loan) => loan.schedule.length > 0)
    .map((loan) => ({ loan, progress: deriveScheduleProgress(loan.schedule, loan.payments) }))
    .filter(
      ({ loan, progress }) =>
        progress.instalmentsPaid !== loan.instalmentsPaid ||
        progress.daysLate !== loan.daysLate ||
        progress.nextDueAt?.getTime() !== loan.nextDueAt?.getTime() ||
        progress.changedRows.length > 0,
    );

  for (const { loan, progress } of pending) {
    const who = `${loan.borrower.firstName} ${loan.borrower.lastName}`;
    const collected = loan.payments.reduce((sum, p) => sum + p.amount, 0);
    console.log(`\n${who}  (${loan.id})`);
    console.log(
      `  collected        ${formatNad(collected)} over ${loan.payments.length} payment(s)`,
    );
    console.log(
      `  instalmentsPaid  ${loan.instalmentsPaid} -> ${progress.instalmentsPaid} of ${loan.instalmentsTotal}`,
    );
    console.log(
      `  nextDueAt        ${loan.nextDueAt?.toISOString().slice(0, 10) ?? 'null'} -> ${progress.nextDueAt?.toISOString().slice(0, 10) ?? 'null'}`,
    );
    console.log(`  daysLate         ${loan.daysLate} -> ${progress.daysLate}`);
    for (const row of progress.changedRows) {
      const before = loan.schedule.find((item) => item.id === row.id);
      console.log(
        `  instalment #${before?.number}    ${before?.status} -> ${row.status}${row.paidAt ? ` (paid ${row.paidAt.toISOString().slice(0, 10)})` : ''}`,
      );
    }

    if (apply) {
      await prisma.$transaction([
        prisma.loan.update({
          where: { id: loan.id },
          data: {
            instalmentsPaid: progress.instalmentsPaid,
            nextDueAt: progress.nextDueAt,
            daysLate: progress.daysLate,
          },
        }),
        ...progress.changedRows.map((row) =>
          prisma.repaymentScheduleItem.update({
            where: { id: row.id },
            data: { status: row.status, paidAt: row.paidAt },
          }),
        ),
      ]);
    }
  }

  const changed = pending.length;
  console.log(
    `\n${changed} of ${loans.length} loans with payments ${apply ? 'updated' : 'would change'}.`,
  );
  if (!changed) {
    console.log('Nothing to do.');
  } else if (!apply) {
    console.log('Dry run — re-run with --apply to write.');
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
