import { renderStatementLetterPdf, type StatementLetterData } from './statement-letter-pdf';

// A valid 1x1 PNG (see agreement-pdf.test.ts for why it must be well-formed).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const sampleData = (over: Partial<StatementLetterData> = {}): StatementLetterData => ({
  statement: {
    generatedAt: new Date('2026-09-22T08:00:00Z'),
    reference: 'ABC123/2026-09-22',
    borrower: {
      name: 'Selma Nghidinwa',
      idNumber: '98031500412',
      phone: '+264811112222',
      email: 'selma@example.na',
      address: '12 Acacia St, Windhoek, Namibia',
    },
    loans: [
      {
        id: 'loan_1',
        type: 'payday',
        disbursedAt: new Date('2026-07-14'),
        principal: 600000,
        instalmentsPaid: 1,
        instalmentsTotal: 2,
        nextDueAt: new Date('2026-09-14'),
        balance: 390000,
        defaultInterest: 19500,
        payoff: 409500,
        status: 'arrears',
      },
    ],
    totals: { outstanding: 409500, lifetimeBorrowed: 1400000, openLoans: 1, settledLoans: 2 },
    hasOutstanding: true,
  },
  lender: {
    name: 'Raccoons Financial Services CC',
    legalName: 'Raccoons Financial Services CC',
    namfisaLicenceNo: '25/11/1471',
    registrationNo: 'CC/2020/1234',
    physicalAddress: 'Erf 863, Stockholm Street',
    postalAddress: null,
    contactPhone: '+264 81 878 9138',
    contactEmail: 'racoonsfs@gmail.com',
    website: 'www.raccoonsfinance.com',
    town: 'Windhoek',
  },
  logoPng: TINY_PNG,
  officerName: 'Eufemia Nghifenwa',
  officerSignaturePng: TINY_PNG,
  stampPng: null,
  ...over,
});

describe('renderStatementLetterPdf', () => {
  it('renders a signed statement with the drawn stamp', async () => {
    const pdf = await renderStatementLetterPdf(sampleData());
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders with a custom stamp image and no open accounts', async () => {
    const data = sampleData({ stampPng: TINY_PNG, officerSignaturePng: null });
    data.statement.loans = [];
    data.statement.totals = { ...data.statement.totals, outstanding: 0, openLoans: 0 };
    data.statement.hasOutstanding = false;
    const pdf = await renderStatementLetterPdf(data);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
