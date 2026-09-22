import { getTerms } from '@loan-pilot/domain';
import { renderAgreementPdf } from './agreement-pdf';
import type { AgreementData } from './agreement-data';

// A 1×1 transparent PNG — a valid image for pdfkit to embed.
// A valid 1x1 PNG. This MUST be well-formed: pdfkit decodes it through png-js, and a
// truncated PNG sends that parser chasing a bogus multi-gigabyte chunk length — which
// turned these two files into a 10-minute CI step while still passing, because the
// assertions only check the PDF header and a minimum length.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Page objects in the rendered PDF (pdfkit writes page dictionaries uncompressed). */
const pageCount = (pdf: Buffer): number =>
  (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

const sampleData = (png: Buffer | null, stampPng: Buffer | null = null): AgreementData => ({
  lender: {
    name: 'Raccoons Financial Services',
    legalName: 'Raccoons Financial Services CC',
    namfisaLicenceNo: '25/11/1471',
    registrationNo: 'CC/2020/1234',
    physicalAddress: 'Erf 863, Stockholm Street',
    postalAddress: 'PO Box 1',
    contactPhone: '+264 81 878 9138',
    contactEmail: 'racoonsfs@gmail.com',
    website: 'www.raccoonsfinance.com',
    town: 'Windhoek',
    principalOfficerName: 'Eufemia Nghifenwa',
  },
  borrower: {
    fullName: 'Selma Nghidinwa',
    idNumber: '98031500412',
    phone: '+264811112222',
    email: 'selma@example.na',
    maritalStatus: 'Single',
    occupation: 'Nurse',
    employer: 'Ministry of Health',
    employerPhone: '+264612000000',
    employerAddress: 'Harvey Street, Windhoek',
    employeeNo: 'EMP-4432',
    residentialAddress: '12 Acacia St, Windhoek, Namibia',
    postalAddress: 'PO Box 22, Windhoek',
    bank: {
      bankName: 'Bank Windhoek',
      accountNumber: '62001234567',
      branchName: 'Main',
      accountHolderName: 'Selma Nghidinwa',
      accountType: 'Savings',
    },
    references: [
      { name: 'Helena K', phone: '+264811234567' },
      { name: 'Petrus H', phone: '+264814455667' },
    ],
  },
  loan: {
    principal: 'N$ 6,000',
    financeCharge: 'N$ 1,800',
    interestRatePct: '30%',
    total: 'N$ 7,800',
    instalment: 'N$ 3,900',
    termMonths: 2,
    instalmentsTotal: 2,
    penaltyRatePct: '5%',
    firstDueDate: '14 August 2026',
    lastDueDate: '14 September 2026',
    periodEndDate: '14 September 2026',
    disbursedAt: '14 July 2026',
    breakdown: [
      { label: 'Principal advanced (paid to Borrower)', amount: 'N$ 6,000', kind: 'item' },
      { label: 'NAMFISA levy', amount: 'N$ 62', kind: 'item' },
      { label: 'Finance charge (30% of principal debt)', amount: 'N$ 1,800', kind: 'item' },
      { label: 'Total repayable', amount: 'N$ 7,800', kind: 'total' },
    ],
  },
  terms: getTerms(),
  tcAcceptedAt: new Date('2026-07-14T09:00:00Z'),
  images: {
    signaturePng: png,
    initialsPng: png,
    logoPng: png,
    officerSignaturePng: png,
    officerInitialsPng: png,
    stampPng,
  },
  generatedAt: new Date('2026-07-14T10:00:00Z'),
});

describe('renderAgreementPdf', () => {
  it('produces a multi-page PDF with the embedded signatures, initials and drawn stamp', async () => {
    const pdf = await renderAgreementPdf(sampleData(TINY_PNG));
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // The terms always start a new page, so the initials strip has pages to sit on.
    expect(pageCount(pdf)).toBeGreaterThanOrEqual(2);
  });

  it('renders without any captured or configured images (legacy/imported loan)', async () => {
    const pdf = await renderAgreementPdf(sampleData(null));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('places a custom stamp image when one is uploaded', async () => {
    const pdf = await renderAgreementPdf(sampleData(TINY_PNG, TINY_PNG));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
