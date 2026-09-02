import * as XLSX from 'xlsx';
import {
  AGEING_BUCKETS,
  LOAN_COUNT_BANDS,
  LOAN_VALUE_BANDS,
  LoanStatus,
  TERM_BANDS,
  type AmountBand,
  type BandedMatrix,
  type MonthlyReport,
  type QuarterlyReturn,
} from '@loan-pilot/domain';
import type { LetterheadDetails } from '../common/pdf/document-layout';
import { renderMonthlyReportPdf } from './monthly-report-pdf';
import { renderMonthlyReportXlsx } from './monthly-report-xlsx';
import { renderQuarterlyReturnPdf } from './quarterly-return-pdf';

const lender: LetterheadDetails = {
  name: 'Racoons Financial Services CC',
  legalName: 'Racoons Financial Services CC',
  namfisaLicenceNo: '25/11/1471',
  registrationNo: 'CC/2011/1234',
  physicalAddress: '12 Independence Avenue',
  postalAddress: 'PO Box 1234',
  contactPhone: '+264 61 123 456',
  contactEmail: 'info@raccoonsfinance.com',
  town: 'Windhoek',
};

const emptyMatrix = (bands: readonly AmountBand[]): BandedMatrix => {
  const row = () => ({
    bands: Object.fromEntries(bands.map((band) => [band.key, 0])),
    total: 0,
  });
  return {
    bands,
    male: row(),
    female: row(),
    other: row(),
    unknown: row(),
    total: row(),
  };
};

const quarterly = (over: Partial<QuarterlyReturn> = {}): QuarterlyReturn => ({
  period: {
    key: '2026-Q1',
    label: 'Q1 2026',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    dueDate: '2026-04-30',
  },
  lender: { name: lender.name, licenceNo: lender.namfisaLicenceNo },
  financial: {
    openingBookValue: 0,
    closingBookValue: 650_000,
    disbursedTotal: 500_000,
    disbursementsByTerm: TERM_BANDS.map((band) => ({
      key: band.key,
      label: band.valueLabel,
      months: band.months,
      value: band.key === 'm1' ? 500_000 : 0,
    })),
    feesCharged: {
      namfisaLevies: 5_150,
      stampDuties: 500,
      insurance: 0,
      otherFees: 0,
      total: 5_650,
    },
    interestOnOutstanding: 150_000,
    repayments: { payroll: 0, debitOrder: 0, cash: 0, other: 0, total: 0 },
    badDebts: {
      openingProvision: 0,
      writtenOffInPeriod: 0,
      provisionRaised: 0,
      closingProvision: 0,
    },
    rescheduledValue: 0,
    ageing: AGEING_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      value: bucket.key === 'current' ? 650_000 : 0,
    })),
  },
  valueMatrices: {
    loansByGender: emptyMatrix(LOAN_VALUE_BANDS),
    salariesByGender: emptyMatrix(LOAN_VALUE_BANDS),
  },
  nonFinancial: {
    complaints: { lodged: 0, resolved: 0, forEntity: 0, forComplainant: 0, unresolved: 0 },
    debtorsOutstanding: 1,
    loansDisbursed: 1,
    activeClients: 1,
    loansOutstanding: { current: 1, arrears: 0, total: 1 },
    disbursementsByTerm: TERM_BANDS.map((band) => ({
      key: band.key,
      label: band.countLabel,
      months: band.months,
      value: band.key === 'm1' ? 1 : 0,
    })),
    loansByPurpose: [{ key: 'consumption', label: 'Consumption', value: 1 }],
    loansByCollectionMethod: [{ key: 'cash', label: 'Cash collection', value: 1 }],
    writtenOffCount: 0,
    rescheduledCount: 0,
    security: { secured: 0, unsecured: 1 },
    outlets: 1,
    otherBusiness: [],
  },
  countMatrices: {
    loansByGender: emptyMatrix(LOAN_COUNT_BANDS),
    salariesByGender: emptyMatrix(LOAN_COUNT_BANDS),
  },
  income: {
    interestOnLoans: 150_000,
    defaultInterest: 0,
    badDebtsRecovered: 0,
    otherIncome: 0,
    total: 150_000,
  },
  liabilities: { namfisaLevy: 5_150, stampDuty: 500, other: [], total: 5_650 },
  manual: {},
  reconciliation: { derived: 650_000, stored: 650_000, variance: 0 },
  coverage: { loansInPeriod: 1, loansMissingGender: 0, loansMissingPurpose: 1 },
  warnings: [{ code: 'manual_missing', severity: 'warning', message: 'Nothing captured yet.' }],
  ...over,
});

const monthly = (over: Partial<MonthlyReport> = {}): MonthlyReport => ({
  period: {
    key: '2026-02',
    label: 'February 2026',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    dueDate: null,
  },
  lender: { name: lender.name, licenceNo: lender.namfisaLicenceNo },
  summary: {
    openingBookValue: 0,
    closingBookValue: 650_000,
    loansDisbursed: 1,
    disbursedValue: 500_000,
    interestBooked: 150_000,
    expectedRepayable: 650_000,
    collected: 0,
    collectionsByMethod: [{ key: 'cash', label: 'Cash collection', value: 0 }],
    expenses: 30_000,
    drawings: 0,
    otherIncome: 0,
    capitalIn: 0,
    namfisaLevies: 5_150,
    stampDuties: 500,
    insurance: 0,
    bankCharges: 0,
    availableFunds: 1_000_000,
    totalCapital: 1_650_000,
    arrearsLoans: 0,
    arrearsValue: 0,
    netCashMovement: -530_000,
  },
  loans: [
    {
      loanId: 'loan_1',
      clientNo: '294',
      borrowerName: 'Aina Shikongo',
      idNumber: '90010112345',
      phone: '0811234567',
      gender: 'female',
      monthlyIncome: 2_100_000,
      principal: 500_000,
      financeCharge: 150_000,
      interestRate: 0.3,
      bankCharges: 0,
      namfisaLevy: 5_150,
      stampDuty: 500,
      insurance: 0,
      total: 650_000,
      instalment: 650_000,
      termMonths: 1,
      balance: 650_000,
      status: LoanStatus.Active,
      disbursedAt: '2026-02-10T00:00:00.000Z',
    },
  ],
  expenseBreakdown: [{ key: 'Rent', label: 'Rent', value: 30_000 }],
  reconciliation: { derived: 650_000, stored: 650_000, variance: 0 },
  warnings: [],
  ...over,
});

describe('renderQuarterlyReturnPdf', () => {
  it('renders a PDF for a populated quarter', async () => {
    const pdf = await renderQuarterlyReturnPdf(quarterly(), lender, null);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders an empty quarter without blowing up on zero rows', async () => {
    const empty = quarterly({
      nonFinancial: {
        ...quarterly().nonFinancial,
        loansDisbursed: 0,
        loansByPurpose: [],
        loansByCollectionMethod: [],
        otherBusiness: [],
      },
      warnings: [],
    });
    const pdf = await renderQuarterlyReturnPdf(empty, lender, null);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('survives a lender with no address or licence on file', async () => {
    const bare: LetterheadDetails = {
      name: 'Lender',
      legalName: null,
      namfisaLicenceNo: null,
      registrationNo: null,
      physicalAddress: null,
      postalAddress: null,
      contactPhone: null,
      contactEmail: null,
      town: null,
    };
    const pdf = await renderQuarterlyReturnPdf(quarterly(), bare, null);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('renderMonthlyReportPdf', () => {
  it('renders a PDF with the loan register', async () => {
    const pdf = await renderMonthlyReportPdf(monthly(), lender, null);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders a month with no loans and no expenses', async () => {
    const pdf = await renderMonthlyReportPdf(
      monthly({ loans: [], expenseBreakdown: [] }),
      lender,
      null,
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('renderMonthlyReportXlsx', () => {
  it('writes a Summary and a Loans sheet', () => {
    const book = XLSX.read(renderMonthlyReportXlsx(monthly()), { type: 'buffer' });
    expect(book.SheetNames).toEqual(['Summary', 'Loans']);
  });

  it('writes money as numbers so Excel can total a column', () => {
    const book = XLSX.read(renderMonthlyReportXlsx(monthly()), { type: 'buffer' });
    const loans = book.Sheets.Loans;
    expect(loans).toBeDefined();
    if (!loans) return;
    const rows: unknown[][] = XLSX.utils.sheet_to_json(loans, { header: 1 });
    const header = rows[0];
    const first = rows[1];
    expect(header?.[1]).toBe('Borrower');
    expect(first?.[1]).toBe('Aina Shikongo');
    // "Loan amount (N$)" — a number in major N$, not a formatted string.
    const amountIndex = (header ?? []).indexOf('Loan amount (N$)');
    expect(typeof first?.[amountIndex]).toBe('number');
    expect(first?.[amountIndex]).toBe(5000);
  });

  it('writes an empty register without failing', () => {
    const book = XLSX.read(renderMonthlyReportXlsx(monthly({ loans: [] })), { type: 'buffer' });
    expect(book.SheetNames).toContain('Loans');
  });
});
