import type { Prisma } from '@prisma/client';
import { addMonths, formatNad, getTerms, type Terms } from '@loan-pilot/domain';
import type { LenderIdentity } from '../settings/settings.service';

/** The loan payload the agreement builder needs (borrower, addresses, bank, references, schedule). */
export type AgreementLoan = Prisma.LoanGetPayload<{
  include: {
    borrower: {
      include: {
        addresses: true;
        bankAccounts: true;
        references: true;
      };
    };
    tenant: { select: { name: true; town: true } };
    schedule: { orderBy: { number: 'asc' } };
  };
}>;

export interface AgreementBank {
  bankName: string;
  accountNumber: string;
  branchName: string | null;
  accountHolderName: string;
  accountType: string;
}

/** Fully-resolved, display-ready data for one loan agreement. */
export interface AgreementData {
  lender: {
    name: string;
    legalName: string | null;
    namfisaLicenceNo: string | null;
    registrationNo: string | null;
    physicalAddress: string | null;
    postalAddress: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    town: string | null;
  };
  borrower: {
    fullName: string;
    idNumber: string;
    phone: string;
    email: string;
    maritalStatus: string | null;
    occupation: string;
    employer: string;
    employerPhone: string | null;
    employerAddress: string | null;
    employeeNo: string | null;
    residentialAddress: string | null;
    postalAddress: string | null;
    bank: AgreementBank | null;
    references: { name: string; phone: string }[];
  };
  loan: {
    principal: string;
    financeCharge: string;
    interestRatePct: string;
    total: string;
    instalment: string;
    termMonths: number;
    instalmentsTotal: number;
    penaltyRatePct: string;
    firstDueDate: string | null;
    lastDueDate: string | null;
    periodEndDate: string | null;
    disbursedAt: string | null;
  };
  terms: Terms;
  tcAcceptedAt: Date | null;
  /** The captured signature image, or null for legacy/imported loans. */
  signaturePng: Buffer | null;
  generatedAt: Date;
}

/** Format a date as e.g. "14 July 2026", or null when absent. */
const formatDate = (date: Date | null | undefined): string | null =>
  date
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

/** Render a whole-number percentage from a fraction (0.3 → "30%"). */
const formatPct = (rate: number): string => `${Math.round(rate * 100)}%`;

/** Join a structured address into a single line, dropping blank parts. */
const formatAddressLine = (address?: {
  street: string;
  suburb: string | null;
  city: string;
  region: string | null;
  country: string;
}): string | null =>
  address
    ? [address.street, address.suburb, address.city, address.region, address.country]
        .filter(Boolean)
        .join(', ')
    : null;

/**
 * Map a loaded loan (plus tenant lender identity, penalty rate, and the captured
 * signature bytes) into fully display-ready agreement data. Pure — all money and
 * dates are pre-formatted so the PDF renderer only lays out strings.
 */
export const toAgreementData = (
  loan: AgreementLoan,
  lender: LenderIdentity,
  penaltyMonthlyRate: number,
  signaturePng: Buffer | null,
  generatedAt: Date,
): AgreementData => {
  const borrower = loan.borrower;
  const residential =
    borrower.addresses.find((a) => a.isActive) ??
    borrower.addresses.find((a) => a.label === 'Residential') ??
    borrower.addresses[0];
  const postal = borrower.addresses.find((a) => a.label === 'Postal');
  const bank =
    borrower.bankAccounts.find((a) => a.isActive) ?? borrower.bankAccounts[0] ?? null;

  const disbursedAt = loan.disbursedAt ?? null;
  const firstItem = loan.schedule[0] ?? null;
  const lastItem = loan.schedule[loan.schedule.length - 1] ?? null;
  const periodEnd = disbursedAt ? addMonths(disbursedAt, loan.termMonths) : null;

  return {
    lender: {
      name: lender.legalName || loan.tenant.name,
      legalName: lender.legalName,
      namfisaLicenceNo: lender.namfisaLicenceNo,
      registrationNo: lender.registrationNo,
      physicalAddress: lender.physicalAddress,
      postalAddress: lender.postalAddress,
      contactPhone: lender.contactPhone,
      contactEmail: lender.contactEmail,
      town: loan.tenant.town,
    },
    borrower: {
      fullName: `${borrower.firstName} ${borrower.lastName}`.trim(),
      idNumber: borrower.idNumber,
      phone: borrower.phone,
      email: borrower.email,
      maritalStatus: borrower.maritalStatus,
      occupation: borrower.occupation,
      employer: borrower.employer,
      employerPhone: borrower.employerPhone,
      employerAddress: borrower.employerAddress,
      employeeNo: borrower.employeeNo,
      residentialAddress: formatAddressLine(residential),
      postalAddress: formatAddressLine(postal),
      bank: bank
        ? {
            bankName: bank.bankName,
            accountNumber: bank.accountNumber,
            branchName: bank.branchName,
            accountHolderName: bank.accountHolderName,
            accountType: bank.accountType,
          }
        : null,
      references: borrower.references.map((r) => ({ name: r.name, phone: r.phone })),
    },
    loan: {
      principal: formatNad(loan.principal),
      financeCharge: formatNad(loan.financeCharge),
      interestRatePct: formatPct(loan.interestRate),
      total: formatNad(loan.total),
      instalment: formatNad(loan.instalment),
      termMonths: loan.termMonths,
      instalmentsTotal: loan.instalmentsTotal,
      penaltyRatePct: formatPct(penaltyMonthlyRate),
      firstDueDate: formatDate(firstItem?.dueAt),
      lastDueDate: formatDate(lastItem?.dueAt),
      periodEndDate: formatDate(periodEnd),
      disbursedAt: formatDate(disbursedAt),
    },
    terms: getTerms(loan.tcVersion ?? undefined),
    tcAcceptedAt: loan.tcAcceptedAt,
    signaturePng,
    generatedAt,
  };
};
