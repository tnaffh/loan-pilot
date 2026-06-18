/**
 * Import the Raccoons Finance loan register into the `rfs` tenant.
 *
 *   pnpm --filter @loan-pilot/api db:import
 *
 * Source of truth is the committed JSON in prisma/import-data/, produced from
 * the real workbook (raccoons-register.xlsx) by parse-register.mjs. The import
 * is idempotent: every entity upserts on a tenant-scoped natural key, so
 * re-running converges.
 *
 * The register details every loan loan-by-loan across all 33 months
 * (Oct 2023 – Jun 2026), so loans are imported directly — no reconstruction.
 * A loan's key is `${monthSlug}#${rowId}` (the per-month row slot); payments
 * join the same key. Expenses carry a `kind` of `expense` (operating cost) or
 * `drawing` (owner withdrawal / dividend). Capital injected by the owners is
 * imported into the separate Investment table.
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
  addMonths,
} from '@loan-pilot/domain';

const prisma = new PrismaClient();
const dataDir = join(__dirname, 'import-data');
const load = <T>(name: string): T[] => JSON.parse(readFileSync(join(dataDir, name), 'utf8')) as T[];

interface BorrowerRow {
  clientName: string;
  idNumber: string;
  phone: string;
  employer: string;
  monthlyIncome: number;
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
interface InvestmentRow {
  seq: number;
  name: string;
  period: string | null;
  contributedAt: string | null;
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
const CLOSED_OUT: ReadonlySet<LoanStatus> = new Set([
  LoanStatus.Settled,
  LoanStatus.WrittenOff,
  LoanStatus.Closed,
]);

/**
 * Reconcile a register loan into the fields LoanPilot stores. The register's
 * Status text is authoritative when present; when it's blank we infer from how
 * much has been collected. Balance and instalments-paid always come from the
 * payments (the Outstanding Balance column in the sheet is unreliable), and
 * missing dates fall back to the loan's reporting month / term length.
 */
const deriveLoanFields = (
  row: LoanRow,
): {
  status: LoanStatus;
  balance: number;
  instalmentsPaid: number;
  disbursedAt: Date | null;
  nextDueAt: Date | null;
} => {
  const total = row.totalRepayable;
  const collected = row.collected ?? 0;
  const registerStatus =
    STATUS[row.status] ??
    (total > 0 && collected >= total
      ? LoanStatus.Settled
      : collected > 0
        ? LoanStatus.PartlyPaid
        : LoanStatus.Active);

  // Payments are the reliable signal. If they fully cover the loan it is settled,
  // regardless of a stale "dispersed"/"partly paid" note left in the register.
  const fullyPaid = total > 0 && collected >= total;
  const status =
    fullyPaid && !CLOSED_OUT.has(registerStatus) ? LoanStatus.Settled : registerStatus;

  const closedOut = CLOSED_OUT.has(status);
  const balance = closedOut ? 0 : Math.max(0, total - collected);

  const perInstalment = row.termMonths > 0 ? Math.round(total / row.termMonths) : total;
  const instalmentsPaid =
    closedOut || balance <= 0
      ? row.termMonths
      : Math.min(row.termMonths, Math.floor(collected / Math.max(1, perInstalment)));

  // Loan date: explicit start date, else the first of its reporting month.
  const disbursedAt = toDate(row.startDate) ?? monthLabelToDate(row.originMonth);
  // Due date: explicit end date, else one term from the loan date.
  const nextDueAt =
    toDate(row.dueDate) ?? (disbursedAt ? addMonths(disbursedAt, row.termMonths || 1) : null);

  return { status, balance, instalmentsPaid, disbursedAt, nextDueAt };
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
    investments: (await prisma.investment.deleteMany({ where: { tenantId } })).count,
    borrowerUsers: (await prisma.user.deleteMany({ where: { tenantId, role: 'borrower' } })).count,
    borrowers: (await prisma.borrower.deleteMany({ where: { tenantId } })).count,
  };
  // eslint-disable-next-line no-console
  console.log('Cleared existing tenant data before import:', purged);

  const borrowerRows = load<BorrowerRow>('raccoons-borrowers.json');
  const loanRows = load<LoanRow>('raccoons-loans.json');
  const paymentRows = load<PaymentRow>('raccoons-payments.json');
  const expenseRows = load<ExpenseRow>('raccoons-expenses.json');
  const investmentRows = load<InvestmentRow>('raccoons-investments.json');

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
    monthlyIncome?: number;
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
        employer,
        occupation: '',
        monthlyIncome: input.monthlyIncome ?? 0, // net salary from the register, when recorded
        employmentType: employmentFor(employer),
        // Address & bank details are not in the register; captured later in the dashboard.
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

  // 3. Loans — every loan in the register, keyed by `${monthSlug}#${rowId}`.
  let loansCreated = 0;
  for (const row of loanRows) {
    const borrowerId = await ensureBorrower(row);
    const { status, balance, instalmentsPaid, disbursedAt, nextDueAt } = deriveLoanFields(row);
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
        instalment: row.termMonths > 0 ? Math.round(row.totalRepayable / row.termMonths) : row.totalRepayable,
        instalmentsPaid,
        instalmentsTotal: row.termMonths,
        balance,
        status,
        originMonth: row.originMonth,
        externalRef: row.loanKey,
        disbursedAt,
        nextDueAt,
      },
    });
    loansCreated += 1;
  }

  // 4. Payments. Loan resolved by loanKey; ref is unique per (loanKey, payRef).
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

  // 5. Expenses (operating costs) and drawings (owner withdrawals / dividends).
  let expensesCreated = 0;
  let drawingsCreated = 0;
  for (const e of expenseRows) {
    const externalRef = `exp#${e.seq}`;
    const kind = e.kind === 'drawing' ? ExpenseKind.Drawing : ExpenseKind.Expense;
    await prisma.expense.upsert({
      where: { tenantId_externalRef: { tenantId, externalRef } },
      update: {},
      create: {
        tenantId,
        kind,
        category: e.category,
        period: e.period,
        incurredAt: toDate(e.incurredAt),
        amount: e.amount,
        externalRef,
      },
    });
    if (kind === ExpenseKind.Drawing) drawingsCreated += 1;
    else expensesCreated += 1;
  }

  // 6. Investments — capital injected into the cash-loan book by the owners.
  let investmentsCreated = 0;
  for (const inv of investmentRows) {
    const externalRef = `inv#${inv.seq}`;
    await prisma.investment.upsert({
      where: { tenantId_externalRef: { tenantId, externalRef } },
      update: {},
      create: {
        tenantId,
        name: inv.name,
        period: inv.period,
        contributedAt: toDate(inv.contributedAt),
        amount: inv.amount,
        externalRef,
      },
    });
    investmentsCreated += 1;
  }

  // eslint-disable-next-line no-console
  console.log('Raccoons import complete:', {
    tenant: tenant.slug,
    borrowers: borrowersCreated,
    loans: loansCreated,
    paymentsImported: paymentsCreated,
    paymentsSkipped,
    expenses: expensesCreated,
    drawings: drawingsCreated,
    investments: investmentsCreated,
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
