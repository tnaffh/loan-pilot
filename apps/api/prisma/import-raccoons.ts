/**
 * Import the Raccoons Finance loan register into the `rfs` tenant.
 *
 *   pnpm --filter @loan-pilot/api db:import
 *
 * Source of truth is the committed JSON in prisma/import-data/, produced from
 * the optimised Google Sheet by parse-sheet.mjs. The import is idempotent:
 * every entity upserts on a tenant-scoped natural key, so re-running converges.
 *
 * Coverage note: the source sheet details loans loan-by-loan only for
 * Oct 2023 – Jun 2024. Payments run later than that; for any payment whose loan
 * is not in the detailed table we reconstruct a minimal 1-month / 30% loan from
 * the payment (these loans are uniform — verified: every detailed loan is a
 * single 30% instalment and every payment equals the loan total). Such loans
 * are tagged `[reconstructed]` in their note. Borrowers (195) and expenses
 * (179) are complete in the source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  EmploymentType,
  ExpenseKind,
  LoanStatus,
  LoanType,
  PaymentMethod,
} from '@loan-pilot/domain';

const prisma = new PrismaClient();
const dataDir = join(__dirname, 'import-data');
const load = <T>(name: string): T[] => JSON.parse(readFileSync(join(dataDir, name), 'utf8')) as T[];

interface BorrowerRow {
  clientName: string;
  idNumber: string;
  phone: string;
  employer: string;
}
interface LoanRow {
  loanKey: string;
  originMonth: string | null;
  clientName: string;
  idNumber: string;
  phone: string;
  employer: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  bankCharges: number;
  namfisaLevy: number;
  stampDuty: number;
  interestBilled: number;
  totalRepayable: number;
  collected: number;
  balance: number;
  status: string;
  startDate: string | null;
  dueDate: string | null;
}
interface PaymentRow {
  payRef: string;
  loanKey: string;
  clientName: string;
  paidAt: string | null;
  amount: number;
  method: string;
  badDebt: boolean;
}
interface ExpenseRow {
  seq: number;
  kind: string;
  period: string | null;
  incurredAt: string | null;
  category: string;
  amount: number;
}

const DEFAULT_RATE = 0.3;

/** Normalise a name for matching: trim, collapse spaces, lowercase. */
const nameKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();
const slug = (name: string): string => nameKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const toDate = (iso: string | null): Date | null => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
/** "October 2023" -> first-of-month Date, else null. */
const monthLabelToDate = (label: string | null | undefined): Date | null => {
  const m = (label ?? '').trim().match(/([A-Za-z]+)\s+(\d{4})/);
  const name = m?.[1]?.slice(0, 3).toLowerCase();
  const year = m?.[2];
  const mon = name ? MONTHS[name] : undefined;
  return mon && year ? new Date(`${year}-${mon}-01T00:00:00.000Z`) : null;
};

const splitName = (full: string): { firstName: string; lastName: string } => {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ');
  return { firstName: parts[0] ?? full.trim(), lastName: parts.slice(1).join(' ') };
};

/** Best-effort employment type from the employer string (the sheet has no column). */
const employmentFor = (employer: string): EmploymentType => {
  const e = employer.toLowerCase();
  if (/self|own|trading|investment|cc\b/.test(e)) return EmploymentType.SelfEmployed;
  if (/ministry|government|police|education|health|nampol|council|municipal|home affairs/.test(e)) {
    return EmploymentType.CivilServant;
  }
  return EmploymentType.PermanentlyEmployed;
};

const METHOD: Record<string, PaymentMethod> = {
  eft: PaymentMethod.Eft,
  cash: PaymentMethod.Cash,
  debit_order: PaymentMethod.DebitOrder,
  deposit: PaymentMethod.Deposit,
  ewallet: PaymentMethod.Ewallet,
  payroll: PaymentMethod.Payroll,
  revolved: PaymentMethod.Revolved,
};
const STATUS: Record<string, LoanStatus> = {
  active: LoanStatus.Active,
  arrears: LoanStatus.Arrears,
  partly_paid: LoanStatus.PartlyPaid,
  settled: LoanStatus.Settled,
  written_off: LoanStatus.WrittenOff,
  closed: LoanStatus.Closed,
};

const main = async (): Promise<void> => {
  // 1. Resolve the Raccoons Finance tenant (matches prisma/seed.ts).
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'rfs' },
    update: {},
    create: {
      slug: 'rfs',
      name: 'Raccoons Financial Services',
      short: 'RFS',
      accent: '#25397a',
      plan: 'growth',
      status: 'active',
      town: 'Windhoek',
      joinedAt: new Date('2023-11-02'),
    },
  });
  const tenantId = tenant.id;

  // This import is authoritative for the tenant's lending data, so replace any
  // prior loans/payments/expenses/borrowers (including dev seed demo rows) to
  // keep the books accurate. Scoped strictly to this tenant; applications and
  // invoices are left untouched. Deleting a loan cascades to its schedule and
  // payments; borrower-portal users are removed first to free the borrower FK.
  const purged = {
    payments: (await prisma.payment.deleteMany({ where: { tenantId } })).count,
    loans: (await prisma.loan.deleteMany({ where: { tenantId } })).count,
    expenses: (await prisma.expense.deleteMany({ where: { tenantId } })).count,
    borrowerUsers: (await prisma.user.deleteMany({ where: { tenantId, role: 'borrower' } })).count,
    borrowers: (await prisma.borrower.deleteMany({ where: { tenantId } })).count,
  };
  // eslint-disable-next-line no-console
  console.log('Cleared existing tenant data before import:', purged);

  const borrowerRows = load<BorrowerRow>('raccoons-borrowers.json');
  const loanRows = load<LoanRow>('raccoons-loans.json');
  const paymentRows = load<PaymentRow>('raccoons-payments.json');
  const expenseRows = load<ExpenseRow>('raccoons-expenses.json');

  // 2. Borrowers. The registry maps both ID number and normalised name to the
  // borrower id so loans/payments can link by whichever they carry.
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  let borrowersCreated = 0;

  const ensureBorrower = async (input: {
    clientName: string;
    idNumber?: string;
    phone?: string;
    employer?: string;
  }): Promise<string> => {
    const id = input.idNumber?.trim() ?? '';
    const nKey = nameKey(input.clientName);
    if (id && byId.has(id)) return byId.get(id)!;
    if (!id && byName.has(nKey)) return byName.get(nKey)!;

    // Borrowers without an ID get a stable synthetic key so the
    // @@unique([tenantId, idNumber]) constraint holds and re-runs are stable.
    const idNumber = id || `NOID-${slug(input.clientName)}`;
    if (byId.has(idNumber)) return byId.get(idNumber)!;

    const { firstName, lastName } = splitName(input.clientName);
    const employer = input.employer?.trim() || 'Unknown';
    const borrower = await prisma.borrower.upsert({
      where: { tenantId_idNumber: { tenantId, idNumber } },
      update: {},
      create: {
        tenantId,
        firstName,
        lastName,
        idNumber,
        phone: input.phone?.trim() ?? '',
        email: '',
        address: '',
        employer,
        occupation: '',
        monthlyIncome: 0, // not recorded in the source register
        employmentType: employmentFor(employer),
        bank: '',
        accountType: '',
      },
    });
    borrowersCreated += 1;
    byId.set(idNumber, borrower.id);
    if (id) byId.set(id, borrower.id);
    byName.set(nKey, borrower.id);
    return borrower.id;
  };

  for (const row of borrowerRows) {
    await ensureBorrower(row);
  }

  // 3. Detailed loans (Oct 2023 – Jun 2024).
  const knownLoanKeys = new Set<string>();
  let loansCreated = 0;
  for (const row of loanRows) {
    const borrowerId = await ensureBorrower(row);
    knownLoanKeys.add(row.loanKey);
    const disbursedAt = toDate(row.startDate);
    await prisma.loan.upsert({
      where: { tenantId_externalRef: { tenantId, externalRef: row.loanKey } },
      update: {},
      create: {
        tenantId,
        borrowerId,
        type: LoanType.Payday,
        principal: row.principal,
        financeCharge: row.interestBilled,
        bankCharges: row.bankCharges,
        namfisaLevy: row.namfisaLevy,
        stampDuty: row.stampDuty,
        interestRate: row.interestRate || DEFAULT_RATE,
        total: row.totalRepayable,
        termMonths: row.termMonths,
        instalment: row.totalRepayable,
        instalmentsPaid: row.balance <= 0 ? row.termMonths : 0,
        instalmentsTotal: row.termMonths,
        balance: row.balance,
        status: STATUS[row.status] ?? LoanStatus.Active,
        originMonth: row.originMonth,
        externalRef: row.loanKey,
        disbursedAt,
        nextDueAt: toDate(row.dueDate),
      },
    });
    loansCreated += 1;
  }

  // 4. Reconstruct loans for payments whose loan is not in the detailed table.
  // Verified uniform: 1-month, 30% flat, paid in full → total == payment amount.
  let loansReconstructed = 0;
  const reconstructed = new Map<string, PaymentRow>();
  for (const p of paymentRows) {
    if (!knownLoanKeys.has(p.loanKey) && !reconstructed.has(p.loanKey)) {
      reconstructed.set(p.loanKey, p);
    }
  }
  for (const [loanKey, p] of reconstructed) {
    const borrowerId = await ensureBorrower({ clientName: p.clientName });
    const total = p.amount;
    const principal = Math.round(total / (1 + DEFAULT_RATE));
    const originMonth = loanKey.split('#')[0] ?? null;
    await prisma.loan.upsert({
      where: { tenantId_externalRef: { tenantId, externalRef: loanKey } },
      update: {},
      create: {
        tenantId,
        borrowerId,
        type: LoanType.Payday,
        principal,
        financeCharge: total - principal,
        interestRate: DEFAULT_RATE,
        total,
        termMonths: 1,
        instalment: total,
        instalmentsPaid: 1,
        instalmentsTotal: 1,
        balance: 0,
        status: LoanStatus.Settled,
        originMonth,
        externalRef: loanKey,
        disbursedAt: toDate(p.paidAt) ?? monthLabelToDate(originMonth),
        nextDueAt: toDate(p.paidAt) ?? monthLabelToDate(originMonth),
        note: '[reconstructed] no loan-level row in source; inferred from payment',
      },
    });
    knownLoanKeys.add(loanKey);
    loansReconstructed += 1;
  }

  // 5. Payments. Loan resolved by loanKey; ref is unique per (loanKey, payRef).
  const loanIdByKey = new Map<string, string>();
  for (const l of await prisma.loan.findMany({
    where: { tenantId, externalRef: { not: null } },
    select: { id: true, externalRef: true },
  })) {
    if (l.externalRef) loanIdByKey.set(l.externalRef, l.id);
  }
  let paymentsCreated = 0;
  let paymentsSkipped = 0;
  for (const p of paymentRows) {
    const loanId = loanIdByKey.get(p.loanKey);
    if (!loanId) {
      paymentsSkipped += 1;
      continue;
    }
    const monthLabel = p.loanKey.split('#')[0] ?? null;
    const paidAt = toDate(p.paidAt) ?? monthLabelToDate(monthLabel) ?? tenant.joinedAt;
    const externalRef = `${p.loanKey}~${p.payRef}`;
    await prisma.payment.upsert({
      where: { tenantId_externalRef: { tenantId, externalRef } },
      update: {},
      create: {
        tenantId,
        loanId,
        paidAt,
        amount: p.amount,
        method: METHOD[p.method] ?? PaymentMethod.Cash,
        badDebt: p.badDebt,
        externalRef,
      },
    });
    paymentsCreated += 1;
  }

  // 6. Expenses & refunds.
  let expensesCreated = 0;
  for (const e of expenseRows) {
    const externalRef = `exp#${e.seq}`;
    await prisma.expense.upsert({
      where: { tenantId_externalRef: { tenantId, externalRef } },
      update: {},
      create: {
        tenantId,
        kind: e.kind === 'refund' ? ExpenseKind.Refund : ExpenseKind.Expense,
        category: e.category,
        period: e.period,
        incurredAt: toDate(e.incurredAt),
        amount: e.amount,
        externalRef,
      },
    });
    expensesCreated += 1;
  }

  // eslint-disable-next-line no-console
  console.log('Raccoons import complete:', {
    tenant: tenant.slug,
    borrowers: borrowersCreated,
    loansDetailed: loansCreated,
    loansReconstructed,
    paymentsImported: paymentsCreated,
    paymentsSkipped,
    expenses: expensesCreated,
  });
};

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
