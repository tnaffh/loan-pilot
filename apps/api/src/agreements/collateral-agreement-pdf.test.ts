import { getCollateralTerms, getTerms } from '@loan-pilot/domain';
import { renderCollateralAgreementPdf } from './collateral-agreement-pdf';
import type { AgreementData } from './agreement-data';
import type { CollateralAgreementData } from './collateral-agreement-data';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const base: AgreementData = {
  lender: {
    name: 'Raccoons Financial Services CC',
    legalName: 'Raccoons Financial Services CC',
    namfisaLicenceNo: '25/11/1471',
    registrationNo: 'CC/2020/1234',
    physicalAddress: 'Erf 863, Stockholm Street',
    postalAddress: 'PO Box 1',
    contactPhone: '+264 81 878 9138',
    contactEmail: 'racoonsfs@gmail.com',
    town: 'Windhoek',
  },
  borrower: {
    fullName: 'Selma Nghidinwa',
    idNumber: '98031500412',
    phone: '+264811112222',
    email: 'selma@example.na',
    maritalStatus: 'Single',
    occupation: 'Nurse',
    employer: 'Ministry of Health',
    employerPhone: null,
    employerAddress: null,
    employeeNo: null,
    residentialAddress: '12 Acacia St, Windhoek, Namibia',
    postalAddress: null,
    bank: null,
    references: [],
  },
  loan: {
    principal: 'N$ 20,000',
    financeCharge: 'N$ 6,000',
    interestRatePct: '30%',
    total: 'N$ 26,000',
    instalment: 'N$ 5,200',
    termMonths: 5,
    instalmentsTotal: 5,
    penaltyRatePct: '5%',
    firstDueDate: '14 August 2026',
    lastDueDate: '14 December 2026',
    periodEndDate: '14 December 2026',
    disbursedAt: '14 July 2026',
    breakdown: [],
  },
  terms: getTerms(),
  tcAcceptedAt: new Date('2026-07-14T09:00:00Z'),
  signaturePng: TINY_PNG,
  logoPng: TINY_PNG,
  generatedAt: new Date('2026-07-14T10:00:00Z'),
};

const sampleData = (photos: Buffer[]): CollateralAgreementData => ({
  base,
  collateral: {
    item: 'Toyota Corolla 2015',
    identifier: 'N 12345 W',
    description: 'Silver sedan, 120,000 km, minor scratches on the rear bumper.',
    condition: 'Good',
    estimatedValue: 'N$ 85,000',
  },
  photos,
  terms: getCollateralTerms(),
});

describe('renderCollateralAgreementPdf', () => {
  it('produces a valid PDF with embedded photos', async () => {
    const pdf = await renderCollateralAgreementPdf(sampleData([TINY_PNG, TINY_PNG]));
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders without any photos', async () => {
    const pdf = await renderCollateralAgreementPdf(sampleData([]));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
