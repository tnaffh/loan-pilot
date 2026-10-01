/**
 * Parser: turns the real Raccoons Finance workbook (raccoons-register.xlsx, the
 * authoritative Google Sheet export) into the clean JSON fixtures consumed by
 * import-raccoons.ts.
 *
 *   node apps/api/prisma/import-data/parse-register.mjs
 *
 * The workbook has 69 tabs:
 *   - 33 monthly loan tabs ("October 2023" … "June 2026") — full loan registers.
 *   - 33 per-month payment tabs ("Payments <Month>").
 *   - "Additional Investment" — capital injected into the cash-loan book.
 *   - "expenditures sheet" — a category × month matrix of operating costs and
 *     owner withdrawals ("Investment Cash-out" → modelled as drawings).
 *   - "refunded $" — ignored entirely (the refund concept was removed).
 *
 * Loan identity is (month, row-ID): the "ID" column is a per-month row slot, not
 * a global key, so a loan is keyed by `${monthSlug}#${rowId}`. Payments join
 * month-scoped: a row in "Payments <M>" with Loan ID k links to loan k in "<M>".
 *
 * Re-run this only when the workbook changes; the committed JSON is the source
 * of truth for the importer and this script keeps the import reproducible.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const here = dirname(fileURLToPath(import.meta.url));
const wb = XLSX.readFile(join(here, 'raccoons-register.xlsx'), { cellDates: true });

// ----- value coercion --------------------------------------------------------

/** A spreadsheet cell to integer N$ cents (cells are major N$, number or string). */
const cents = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.round(v * 100);
  const t = String(v).trim();
  if (!t || t === '-' || t === '–') return 0;
  const n = Number.parseFloat(t.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** A rate cell to a fraction: 0.3 stays 0.3; 30 or "30%" become 0.3. */
const rate = (v) => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(/[%\s]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
};

const intOr = (v, fallback) => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v) => (v == null ? '' : String(v).trim().replace(/\s+/g, ' '));

const pad = (n) => String(n).padStart(2, '0');

/** Whole months from the `YYYY-MM` anchor to a (year, month) pair. */
const monthsFrom = (anchor, year, mon) => {
  const [ay, am] = anchor.split('-').map(Number);
  return (year - ay) * 12 + (mon - am);
};

/**
 * Pick between a date and its day/month-swapped twin.
 *
 * The lender types dates as dd/mm (Namibian convention) into a sheet that reads
 * them as mm/dd, so a cell showing "06/10/23" is stored as 10 June when 6 October
 * was meant. Whenever both readings are valid the one nearer the tab's month
 * wins. `bias` settles near-ties from what the date is: a loan's start date
 * often precedes its tab ('before'), while a repayment or due date cannot
 * precede the loan ('after'), so a candidate on the wrong side of the tab's month
 * carries a small penalty. On a dead tie the first candidate is kept.
 */
const nearestToAnchor = (anchor, preferred, alternative, bias) => {
  if (!anchor) return preferred;
  const cost = (d) => {
    const offset = monthsFrom(anchor, d.year, d.mon);
    const wrongSide = bias === 'after' ? offset < 0 : offset > 0;
    return Math.abs(offset) + (wrongSide ? 0.5 : 0);
  };
  return cost(alternative) < cost(preferred) ? alternative : preferred;
};

/**
 * Snap an obviously mistyped year back onto the tab's year. A repayment dated a
 * whole year or more away from the loan's month cannot be real — the sheet has
 * a run of January 2024 repayments dated 2025…2029 where a fill-handle dragged
 * the year — and the same day/month in the tab's year lands where it belongs.
 */
const snapYear = (anchor, d) => {
  if (!anchor || Math.abs(monthsFrom(anchor, d.year, d.mon)) < 12) return d;
  const year = Number(anchor.slice(0, 4));
  for (const candidate of [year, year + 1, year - 1]) {
    if (Math.abs(monthsFrom(anchor, candidate, d.mon)) <= 3) return { ...d, year: candidate };
  }
  return d;
};

const validDay = (d) => d.mon >= 1 && d.mon <= 12 && d.day >= 1 && d.day <= 31;
const fmt = (d) => `${d.year}-${pad(d.mon)}-${pad(d.day)}`;

/**
 * A date cell (Date object, ISO, dd/mm/yy or mm/dd/yyyy) to ISO yyyy-mm-dd, or
 * null. `anchor` is the tab's `YYYY-MM`; it resolves day/month ambiguity and
 * mistyped years (see above), so pass it for every loan and repayment date,
 * with `bias` 'before' for a loan's start date and 'after' for everything else.
 */
const isoDate = (v, anchor = null, bias = 'after') => {
  if (v == null || v === '') return null;
  const resolve = (year, a, b, preferSwapped) => {
    // `a` is what the sheet calls the month, `b` the day. Both readings are
    // candidates only when each field could be either.
    const natural = { year, mon: a, day: b };
    const swapped = { year, mon: b, day: a };
    const ambiguous = a >= 1 && a <= 12 && b >= 1 && b <= 12 && a !== b;
    const picked = !ambiguous
      ? validDay(natural)
        ? natural
        : swapped
      : !anchor
        ? natural
        : preferSwapped
          ? nearestToAnchor(anchor, swapped, natural, bias)
          : nearestToAnchor(anchor, natural, swapped, bias);
    return validDay(picked) ? fmt(snapYear(anchor, picked)) : null;
  };
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // A stored Date is the sheet's mm/dd reading of what was typed as dd/mm.
    return resolve(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), true);
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return fmt(snapYear(anchor, { year: Number(m[1]), mon: Number(m[2]), day: Number(m[3]) }));
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    // Typed text is dd/mm first; the swapped (mm/dd) reading is the fallback.
    return resolve(year, Number(m[2]), Number(m[1]), false);
  }
  return null;
};

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** A month label ("October 2023", " November 2024 ") to "YYYY-MM", or null. */
const monthSlug = (label) => {
  const m = str(label).match(/([A-Za-z]+)\s+(\d{4})/);
  const mon = m ? MONTHS[m[1].slice(0, 3).toLowerCase()] : undefined;
  return mon && m ? `${m[2]}-${pad(mon)}` : null;
};

// ----- enum mapping ----------------------------------------------------------

const STATUS = {
  'fully paid': 'settled',
  paid: 'settled',
  settled: 'settled',
  'partily paid': 'partly_paid',
  'partly paid': 'partly_paid',
  'partialy paid': 'partly_paid',
  // "Dispersed"/"disbursed" is the register's word for a live, outstanding loan.
  dispersed: 'active',
  disbursed: 'active',
  outstanding: 'active',
  active: 'active',
  aproved: 'active',
  approved: 'active',
  'waiting for repayment': 'active',
  overdue: 'arrears',
  arrears: 'arrears',
  'in arrears': 'arrears',
  'written off': 'written_off',
  'write off': 'written_off',
  'bad debt': 'written_off',
  revolved: 'active',
  'revolved loan': 'active',
};
/**
 * Map the register's Status text to a LoanStatus. The "Outstanding Balance"
 * column is unreliable (left at 0 even for live loans), so an unrecognised or
 * blank status returns '' — the importer then derives the real status from the
 * payments it has matched to the loan.
 */
const loanStatus = (text) => STATUS[str(text).toLowerCase()] ?? '';

const METHOD = {
  eft: 'eft',
  cash: 'cash',
  'debt order': 'debit_order',
  'debit order': 'debit_order',
  'debt order ': 'debit_order',
  deposit: 'deposit',
  'e wallet': 'ewallet',
  'e-wallet': 'ewallet',
  ewallet: 'ewallet',
  payroll: 'payroll',
  'revolved loan': 'revolved',
  revolved: 'revolved',
};
const payMethod = (text) => METHOD[str(text).toLowerCase()] ?? 'cash';

const truthy = (v) => {
  const t = str(v).toLowerCase();
  return t !== '' && t !== '0' && t !== 'no' && t !== 'false' && t !== '-';
};

// ----- tab classification ----------------------------------------------------

const SPECIAL = new Set(['additional investment', 'expenditures sheet', 'refunded $']);
const isPaymentTab = (name) => str(name).toLowerCase().startsWith('payments');
const rowsOf = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });

const loanTabs = wb.SheetNames.filter(
  (n) => !isPaymentTab(n) && !SPECIAL.has(str(n).toLowerCase()),
);
const paymentTabs = wb.SheetNames.filter(isPaymentTab);

// ----- loans + borrowers -----------------------------------------------------

/**
 * Build a header-text → array-index map for the first row that contains a cell
 * matching `marker` (case-insensitive). SheetJS indexes columns relative to each
 * sheet's used range, so positions shift between tabs — always locate by content.
 */
const headerMap = (rows, marker, limit = 30, mergeAbove = false) => {
  for (let r = 0; r < Math.min(rows.length, limit); r += 1) {
    const row = rows[r];
    if (!row) continue;
    if (row.some((cell) => str(cell).toLowerCase() === marker)) {
      const map = {};
      const claimed = new Set();
      row.forEach((cell, c) => {
        const key = str(cell).toLowerCase();
        if (key) {
          map[key] = c;
          claimed.add(c);
        }
      });
      // Some loan tabs carry "Status" only in the merged super-header band one
      // row above; fold in labels for columns the detail row left blank.
      if (mergeAbove && r > 0) {
        (rows[r - 1] ?? []).forEach((cell, c) => {
          const key = str(cell).toLowerCase();
          if (key && !claimed.has(c) && map[key] === undefined) map[key] = c;
        });
      }
      return { row: r, map };
    }
  }
  return null;
};

const loans = [];
const seenLoanKeys = new Set();
for (const tab of loanTabs) {
  const slug = monthSlug(tab);
  if (!slug) {
    console.warn(`! loan tab with no parseable month: ${tab}`);
    continue;
  }
  const rows = rowsOf(tab);
  const header = headerMap(rows, 'id', 30, true);
  if (!header) {
    console.warn(`! no loan header found in tab: ${tab}`);
    continue;
  }
  const { map } = header;
  const col = (name) => map[name];
  const amtC = col('loan amount');
  const idC = col('id');
  for (let r = header.row + 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row) continue;
    const principal = cents(amtC != null ? row[amtC] : null);
    const id = intOr(idC != null ? row[idC] : null, null);
    if (principal <= 0 || id == null) continue;
    const loanKey = `${slug}#${id}`;
    if (seenLoanKeys.has(loanKey)) continue; // keep first occurrence within a month
    seenLoanKeys.add(loanKey);
    const balance = cents(row[col('outstanding balance')]);
    loans.push({
      loanKey,
      originMonth: str(tab),
      clientName: str(row[col('full name')]),
      idNumber: str(row[col('id number')]),
      phone: str(row[col('phone number')]),
      employer: str(row[col('employer name')]),
      monthlyIncome: cents(row[col('net salary')]),
      principal,
      interestRate: rate(row[col('intrest rate')]),
      termMonths: intOr(row[col('repayment period (months)')], 1) || 1,
      bankCharges: cents(row[col('bank charges/transaction fees')]),
      namfisaLevy: cents(row[col('namfisa levies')]),
      stampDuty: cents(row[col('stamp duties')]),
      interestBilled: cents(row[col('total interest')]),
      totalRepayable: cents(row[col('total repayment amount')]),
      balance,
      status: loanStatus(row[col('status')]),
      startDate: isoDate(row[col('start date')], slug, 'before'),
      dueDate: isoDate(row[col('end date')], slug),
    });
  }
}

// Borrower registry: dedupe loan rows by normalised name, keeping the most
// complete identity and the largest recorded net salary.
const nameKey = (s) => str(s).toLowerCase();
const borrowerMap = new Map();
for (const l of loans) {
  if (!l.clientName) continue;
  const key = nameKey(l.clientName);
  const prev = borrowerMap.get(key);
  if (!prev) {
    borrowerMap.set(key, {
      clientName: l.clientName,
      idNumber: l.idNumber,
      phone: l.phone,
      employer: l.employer,
      monthlyIncome: l.monthlyIncome,
    });
  } else {
    prev.idNumber ||= l.idNumber;
    prev.phone ||= l.phone;
    prev.employer ||= l.employer;
    if (l.monthlyIncome > prev.monthlyIncome) prev.monthlyIncome = l.monthlyIncome;
  }
}
const borrowers = [...borrowerMap.values()];

// ----- payments --------------------------------------------------------------

const payments = [];
const payRefByKey = new Map();
for (const tab of paymentTabs) {
  const label = str(tab).replace(/^payments/i, '');
  const slug = monthSlug(label);
  if (!slug) {
    console.warn(`! payment tab with no parseable month: ${tab}`);
    continue;
  }
  const rows = rowsOf(tab);
  // header row is [Loan ID, Date, Amount, Method of Payment, (bad debts)]
  const header = headerMap(rows, 'loan id', 10);
  if (!header) {
    console.warn(`! no payment header found in tab: ${tab}`);
    continue;
  }
  const { map } = header;
  const idC = map['loan id'];
  const dateC = map.date;
  const amtC = map.amount;
  const methodC = map['method of payment'];
  const badC = map['bad debts'] ?? map['bad debt'];
  for (let r = header.row + 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row) continue;
    const id = intOr(row[idC], null);
    const amount = cents(row[amtC]);
    if (id == null || amount <= 0) continue;
    const loanKey = `${slug}#${id}`;
    const n = (payRefByKey.get(loanKey) ?? 0) + 1;
    payRefByKey.set(loanKey, n);
    payments.push({
      payRef: String(n),
      loanKey,
      paidAt: isoDate(row[dateC], slug),
      amount,
      method: payMethod(row[methodC]),
      badDebt: badC != null && truthy(row[badC]),
    });
  }
}

// ----- investments -----------------------------------------------------------

const investmentTab = wb.SheetNames.find((n) => str(n).toLowerCase() === 'additional investment');
const investmentRows = rowsOf(investmentTab);
const invHeader = headerMap(investmentRows, 'name', 10);
const investments = [];
if (invHeader) {
  const nameC = invHeader.map.name;
  const dateC = invHeader.map.date;
  const amtC = invHeader.map.amount;
  for (let r = invHeader.row + 1; r < investmentRows.length; r += 1) {
    const row = investmentRows[r];
    if (!row) continue;
    const name = str(row[nameC]);
    const amount = cents(row[amtC]);
    if (!name || amount <= 0) continue;
    investments.push({
      seq: investments.length + 1,
      name,
      period: str(row[dateC]) || null, // loose month label, often no year in the source
      contributedAt: isoDate(row[dateC]),
      amount,
    });
  }
}

// ----- expenditure (category × month matrix) ---------------------------------

const expRows = rowsOf('expenditures sheet');
// The header row holds "Expendictures" in the category column; the columns to
// its right are month headers (mostly real dates; a few are bare month-name
// strings sitting in 2025). Locate it by content — SheetJS column indices are
// relative to the sheet's used range.
const expHead = headerMap(expRows, 'expendictures', 10);
const expHeaderRow = expHead?.row ?? 0;
const categoryCol = expHead?.map.expendictures ?? 0;
const expHeader = expRows[expHeaderRow] ?? [];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthCols = []; // { col, period, incurredAt }
const pushMonth = (col, year, mon) =>
  monthCols.push({ col, period: `${SHORT[mon - 1]} ${year}`, incurredAt: `${year}-${pad(mon)}-01` });
let carryYear = null;
for (let c = categoryCol + 1; c < expHeader.length; c += 1) {
  const h = expHeader[c];
  if (h instanceof Date && !Number.isNaN(h.getTime())) {
    // Google exports first-of-month as the prior day at 22:00 UTC (UTC+2 local);
    // shift forward before reading the month so it lands in the intended month.
    const d = new Date(h.getTime() + 12 * 3600 * 1000);
    carryYear = d.getUTCFullYear();
    pushMonth(c, carryYear, d.getUTCMonth() + 1);
  } else if (h != null && String(h).trim()) {
    // Bare month name (e.g. "JULY", "0CTOBER", "NOVEMBER "); year carries from
    // the most recent dated header to its left.
    const name = String(h).trim().replace(/0/g, 'o').slice(0, 3).toLowerCase();
    const mon = MONTHS[name];
    if (mon && carryYear) pushMonth(c, carryYear, mon);
  }
}

const isDrawing = (category) => /investment\s*cash/i.test(category);
const expenses = [];
for (let r = expHeaderRow + 1; r < expRows.length; r += 1) {
  const row = expRows[r];
  if (!row) continue;
  const category = str(row[categoryCol]);
  if (!category || category.toLowerCase() === 'total') continue;
  for (const mc of monthCols) {
    const amount = cents(row[mc.col]);
    if (amount <= 0) continue;
    expenses.push({
      seq: expenses.length + 1,
      kind: isDrawing(category) ? 'drawing' : 'expense',
      period: mc.period,
      incurredAt: mc.incurredAt,
      category,
      amount,
    });
  }
}

// ----- reconcile collected ---------------------------------------------------
// The register's Outstanding Balance column is unreliable, so attach the sum of
// matched payments to each loan. The importer derives the real balance, status
// and instalments-paid from this.
const collectedByKey = new Map();
for (const p of payments) {
  collectedByKey.set(p.loanKey, (collectedByKey.get(p.loanKey) ?? 0) + p.amount);
}
for (const l of loans) {
  l.collected = collectedByKey.get(l.loanKey) ?? 0;
}

// ----- emit ------------------------------------------------------------------

const write = (name, data) => writeFileSync(join(here, name), `${JSON.stringify(data, null, 2)}\n`);
write('raccoons-borrowers.json', borrowers);
write('raccoons-loans.json', loans);
write('raccoons-payments.json', payments);
write('raccoons-expenses.json', expenses);
write('raccoons-investments.json', investments);

// ----- validation log --------------------------------------------------------

const loanKeySet = new Set(loans.map((l) => l.loanKey));
const matched = payments.filter((p) => loanKeySet.has(p.loanKey)).length;
const drawings = expenses.filter((e) => e.kind === 'drawing');
const sum = (rows, f) => rows.reduce((a, b) => a + f(b), 0);
console.log('Parsed register fixtures:');
console.log(`  loan tabs:    ${loanTabs.length}`);
console.log(`  payment tabs: ${paymentTabs.length}`);
console.log(`  borrowers:    ${borrowers.length}`);
console.log(`  loans:        ${loans.length}`);
console.log(`  payments:     ${payments.length} (matched ${matched}, unmatched ${payments.length - matched})`);
console.log(`  expenses:     ${expenses.length - drawings.length} operating + ${drawings.length} drawings`);
console.log(`  investments:  ${investments.length} (N$ ${(sum(investments, (i) => i.amount) / 100).toLocaleString()})`);
console.log('  unmatched payments:', payments.filter((p) => !loanKeySet.has(p.loanKey)).map((p) => p.loanKey));
console.log('  distinct loan statuses:', [...new Set(loans.map((l) => l.status))].sort());
console.log('  distinct payment methods:', [...new Set(payments.map((p) => p.method))].sort());
console.log('  loans missing ID number:', loans.filter((l) => !l.idNumber).length);
console.log('  payments missing date:', payments.filter((p) => !p.paidAt).length);
