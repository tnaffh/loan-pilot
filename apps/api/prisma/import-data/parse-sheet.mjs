/**
 * One-off parser: turns the optimised Raccoons Finance Google Sheet dump
 * (raccoons-optimised-sheet.md, a markdown rendering of the spreadsheet) into
 * three clean JSON fixtures consumed by import-raccoons.ts.
 *
 *   node apps/api/prisma/import-data/parse-sheet.mjs
 *
 * Re-run this only if the source sheet changes. The committed JSON files are
 * the source of truth for the importer; this script documents how they were
 * produced and keeps the import reproducible.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, 'raccoons-optimised-sheet.md'), 'utf8');
const lines = md.split('\n');

/** Split a markdown table row into trimmed, unescaped cell strings. */
const cells = (line) =>
  line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim().replace(/\\(.)/g, '$1'));

const isDataRow = (line) => line.startsWith('|') && !/^\|\s*:?-+:?\s*\|/.test(line);

/** Parse a money string ("1,000.00", "$1,315", "-", "") to integer cents. */
const cents = (s) => {
  const t = (s ?? '').trim();
  if (!t || t === '-' || t === '–') return 0;
  const n = Number.parseFloat(t.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Parse a rate string ("30.0%") to a fraction (0.3). */
const rate = (s) => {
  const n = Number.parseFloat((s ?? '').replace(/[%\s]/g, ''));
  return Number.isFinite(n) ? n / 100 : 0;
};

/** Parse a date in ISO, dd/mm/yy or dd/mm/yyyy form to an ISO yyyy-mm-dd string, or null. */
const isoDate = (s) => {
  const t = (s ?? '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
};

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
/** Parse an expense month label ("Dec 2023") to first-of-month ISO date, else null. */
const monthToDate = (s) => {
  const m = (s ?? '').trim().match(/([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  return mon ? `${m[2]}-${mon}-01` : null;
};

const STATUS = {
  paid: 'settled',
  outstanding: 'active',
  'partly paid': 'partly_paid',
  'written off': 'written_off',
  'bad debt': 'written_off',
  revolved: 'active',
  'revolved loan': 'active',
};
const loanStatus = (s) => STATUS[(s ?? '').trim().toLowerCase()] ?? 'active';

const METHOD = {
  eft: 'eft',
  cash: 'cash',
  'debt order': 'debit_order',
  'debit order': 'debit_order',
  deposit: 'deposit',
  'e-wallet': 'ewallet',
  ewallet: 'ewallet',
  payroll: 'payroll',
  'revolved loan': 'revolved',
  revolved: 'revolved',
};
const payMethod = (s) => METHOD[(s ?? '').trim().toLowerCase()] ?? 'cash';

const truthy = (s) => {
  const t = (s ?? '').trim().toLowerCase();
  return t !== '' && t !== '0' && t !== 'no' && t !== 'false' && t !== '-';
};

// Locate the three tables by their header rows.
const headerIndex = (needle) => lines.findIndex((l) => l.includes(needle));
const loansHeader = headerIndex('Loan Ref | Origin Month');
const paymentsHeader = headerIndex('Pay Ref | Loan Month');
// Starts-with, since the loans header also contains "Client Name | ID Number …".
const clientsHeader = lines.findIndex((l) => l.startsWith('| Client Name |'));
const monthlyHeader = headerIndex('Month | Loans | Disbursed');
const expensesHeader = headerIndex('Type | Month | Category');

// Collect contiguous data rows after a header (skip the alignment row), until a blank line.
const rowsAfter = (headerIdx) => {
  const out = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (isDataRow(line)) out.push(cells(line));
  }
  return out;
};

const loanRows = rowsAfter(loansHeader);
const paymentRows = rowsAfter(paymentsHeader);
const clientRows = rowsAfter(clientsHeader);
const monthlyRows = rowsAfter(monthlyHeader);
const expenseRows = rowsAfter(expensesHeader);

// The authoritative borrower list — lifetime aggregates per client, complete
// across all months (the loans table below only details Oct 2023 – Jun 2024).
const borrowers = clientRows
  .filter((c) => c[0] /* Client Name */)
  .map((c) => ({
    clientName: c[0],
    idNumber: c[1] || '',
    phone: c[2] || '',
    employer: c[3] || '',
    loanCount: Number.parseInt(c[4], 10) || 0,
    totalBorrowed: cents(c[5]),
    totalRepaid: cents(c[6]),
    currentExposure: cents(c[7]),
  }));

// Monthly roll-up; kept for audit/reference (top-line totals are complete to
// Jun 2026 even where loan-level detail is not). Not imported as rows.
const monthly = monthlyRows
  .filter((c) => c[0] && /\d/.test(c[1] ?? ''))
  .map((c) => ({
    month: c[0],
    loans: Number.parseInt(c[1], 10) || 0,
    disbursed: cents(c[2]),
    collected: cents(c[3]),
    outstanding: cents(c[4]),
  }));

const loans = loanRows
  .filter((c) => c[21] /* Loan Key */)
  .map((c) => ({
    loanKey: c[21],
    originMonth: c[1] || null,
    origId: c[2] || null,
    clientName: c[3] || '',
    idNumber: c[4] || '',
    phone: c[5] || '',
    employer: c[6] || '',
    principal: cents(c[7]),
    interestRate: rate(c[8]),
    termMonths: Number.parseInt(c[9], 10) || 1,
    bankCharges: cents(c[10]),
    namfisaLevy: cents(c[11]),
    stampDuty: cents(c[12]),
    interestBilled: cents(c[13]),
    totalRepayable: cents(c[14]),
    collected: cents(c[15]),
    balance: cents(c[16]),
    status: loanStatus(c[17]),
    startDate: isoDate(c[19]),
    dueDate: isoDate(c[20]),
  }));

const payments = paymentRows
  .filter((c) => c[9] /* Loan Key */ && cents(c[6]) > 0)
  .map((c, i) => ({
    payRef: c[0] || String(i + 1),
    loanKey: c[9],
    clientName: c[4] || '',
    paidAt: isoDate(c[5]),
    amount: cents(c[6]),
    method: payMethod(c[7]),
    badDebt: truthy(c[8]),
  }));

const expenses = expenseRows
  .filter((c) => c[2] /* category */ && cents(c[3]) > 0)
  .map((c, i) => ({
    seq: i + 1,
    kind: (c[0] || '').trim().toLowerCase() === 'refund' ? 'refund' : 'expense',
    period: c[1] || null,
    incurredAt: monthToDate(c[1]),
    category: c[2],
    amount: cents(c[3]),
  }));

const write = (name, data) =>
  writeFileSync(join(here, name), `${JSON.stringify(data, null, 2)}\n`);

write('raccoons-borrowers.json', borrowers);
write('raccoons-loans.json', loans);
write('raccoons-payments.json', payments);
write('raccoons-expenses.json', expenses);
write('raccoons-monthly.json', monthly);

// Report distinct enum-mapped values so the mapping can be eyeballed.
const distinct = (rows, idx) => [...new Set(rows.map((c) => (c[idx] || '').trim()).filter(Boolean))].sort();
console.log('Parsed fixtures:');
console.log(`  borrowers: ${borrowers.length}`);
console.log(`  loans:     ${loans.length}`);
console.log(`  payments:  ${payments.length}`);
console.log(`  expenses:  ${expenses.length}`);
console.log(`  monthly:   ${monthly.length}`);
console.log('Distinct loan statuses:', distinct(loanRows, 17));
console.log('Distinct payment methods:', distinct(paymentRows, 7));
console.log('Distinct expense kinds:', distinct(expenseRows, 0));
console.log('Loans missing ID number:', loans.filter((l) => !l.idNumber).length);
console.log('Payments with no matching date:', payments.filter((p) => !p.paidAt).length);
