import type { Prisma } from '@prisma/client';
import {
  addMonths,
  assessArrears,
  formatNad,
  getTerms,
  InterestMethod,
  RenewalBasis,
  RepaymentStatus,
  type Terms,
} from '@loan-pilot/domain';
import type { LenderIdentity } from '../settings/settings.service';

/** A single line of the itemised cost breakdown. */
export interface BreakdownLine {
  label: string;
  amount: string;
  /** 'item' = a charge component, 'total' = total repayable, 'extra' = accrued/payoff. */
  kind: 'item' | 'total' | 'extra';
}

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
    tenant: { select: { name: true; town: true; logoUrl: true } };
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

/**
 * The images embedded into an agreement. Each is null when not captured /
 * configured, in which case the PDF leaves a blank line or box to be completed
 * by hand (legacy loans, wet-sign flow).
 */
export interface AgreementImages {
  /** The borrower's captured signature (signing page). */
  signaturePng: Buffer | null;
  /** The borrower's captured initials (every page but the signing page). */
  initialsPng: Buffer | null;
  /** The tenant's logo for the letterhead. */
  logoPng: Buffer | null;
  /** The principal officer's signature and initials. */
  officerSignaturePng: Buffer | null;
  officerInitialsPng: Buffer | null;
  /** A custom uploaded company stamp; null draws the default stamp instead. */
  stampPng: Buffer | null;
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
    website: string | null;
    town: string | null;
    /** Who signs for the lender, or null when not yet configured in settings. */
    principalOfficerName: string | null;
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
    /** The rate line of the loan terms, worded for the loan's calculation method. */
    rateLabel: string;
    rateText: string;
    /** How the method works, where it needs saying (monthly renewal); else null. */
    methodNote: string | null;
    /** Whether default (penalty) interest applies — not on a monthly-renewal loan. */
    chargesPenaltyInterest: boolean;
    /** Itemised charges that make up the total repayable (+ any accrued penalty). */
    breakdown: BreakdownLine[];
  };
  terms: Terms;
  tcAcceptedAt: Date | null;
  images: AgreementImages;
  generatedAt: Date;
}

/** Format a date as e.g. "14 July 2026", or null when absent. */
const formatDate = (date: Date | null | undefined): string | null =>
  date
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

/** Render a whole-number percentage from a fraction (0.3 → "30%"). */
const formatPct = (rate: number): string => `${Math.round(rate * 100)}%`;

/** Render a percentage keeping up to two decimals (0.155 → "15.5%"). */
const formatRate = (rate: number): string => `${Math.round(rate * 10000) / 100}%`;

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
 * Map a loaded loan (plus tenant lender identity, penalty rate, and the
 * embedded image bytes) into fully display-ready agreement data. Pure — all
 * money and dates are pre-formatted so the PDF renderer only lays out strings.
 */
export const toAgreementData = (
  loan: AgreementLoan,
  lender: LenderIdentity,
  penaltyMonthlyRate: number,
  images: AgreementImages,
  generatedAt: Date,
): AgreementData => {
  const borrower = loan.borrower;
  const residential =
    borrower.addresses.find((a) => a.isActive) ??
    borrower.addresses.find((a) => a.label === 'Residential') ??
    borrower.addresses[0];
  const postal = borrower.addresses.find((a) => a.label === 'Postal');
  const bank = borrower.bankAccounts.find((a) => a.isActive) ?? borrower.bankAccounts[0] ?? null;

  const disbursedAt = loan.disbursedAt ?? null;
  const firstItem = loan.schedule[0] ?? null;
  const lastItem = loan.schedule[loan.schedule.length - 1] ?? null;
  const renewing = loan.interestMethod === InterestMethod.MonthlyRenewal;
  const termLoan = loan.interestMethod === InterestMethod.TermLoan;
  const renewalCharges = loan.renewalCharges ?? 0;
  // A monthly-renewal loan's period ends on its current due date, which moves
  // on a month each time it renews.
  const periodEnd = renewing
    ? (lastItem?.dueAt ?? null)
    : disbursedAt
      ? addMonths(disbursedAt, loan.termMonths)
      : null;
  const rateText = termLoan
    ? `${formatRate(loan.annualRate ?? 0)} a year (Bank of Namibia rate ` +
      `${formatRate(loan.bonRate ?? 0)} + ${formatRate(loan.marginRate ?? 0)}), on the reducing balance`
    : renewing
      ? `${formatPct(loan.interestRate)} a month, charged again each month the loan renews`
      : `${formatPct(loan.interestRate)} fixed (NAMFISA max 30%)`;
  const methodNote = renewing
    ? 'This is a monthly renewal loan. If the amount due is not paid in full by its due date ' +
      '(plus any grace days allowed by the Lender), the loan renews for a further month and a ' +
      `renewal charge of ${formatPct(loan.interestRate)} of ` +
      (loan.renewalBasis === RenewalBasis.Balance
        ? 'the full outstanding balance'
        : 'the amount borrowed that is still unpaid') +
      ' is added. The figures shown are as at the date of this document.'
    : null;

  // Itemised charges that build up to the total repayable. Zero fees are
  // omitted, so a loan without a given fee reads cleanly. The components sum
  // exactly to `total` (principal debt + finance charge + bank charges).
  const breakdown: BreakdownLine[] = (
    [
      { label: 'Principal advanced (paid to Borrower)', cents: loan.principal },
      { label: 'Stamp duty', cents: loan.stampDuty },
      { label: 'Insurance', cents: loan.insurance },
      { label: 'NAMFISA levy', cents: loan.namfisaLevy },
      {
        label: termLoan
          ? `Interest over the term (${formatRate(loan.annualRate ?? 0)} a year)`
          : `Finance charge (${formatPct(loan.interestRate)} of principal debt)`,
        cents: loan.financeCharge - renewalCharges,
      },
      { label: 'Renewal charges to date', cents: renewalCharges },
      { label: 'Bank charges', cents: loan.bankCharges },
    ] as const
  )
    .filter((item) => item.cents > 0)
    .map((item) => ({ label: item.label, amount: formatNad(item.cents), kind: 'item' as const }));

  breakdown.push({ label: 'Total repayable', amount: formatNad(loan.total), kind: 'total' });

  // Default (penalty) interest accrued to date — only present when the loan is
  // currently overdue (zero for a freshly disbursed loan).
  const arrears = assessArrears(
    loan.schedule.map((item) => ({
      amountCents: item.amount,
      dueAt: item.dueAt,
      paid: item.status === RepaymentStatus.Paid,
    })),
    generatedAt,
    penaltyMonthlyRate,
  );

  // A monthly-renewal loan renews instead of accruing default interest.
  if (!renewing && arrears.defaultInterestCents > 0) {
    breakdown.push({
      label: 'Default interest accrued to date',
      amount: formatNad(arrears.defaultInterestCents),
      kind: 'extra',
    });
    breakdown.push({
      label: 'Payoff to date',
      amount: formatNad(loan.total + arrears.defaultInterestCents),
      kind: 'extra',
    });
  }

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
      website: lender.website,
      town: loan.tenant.town,
      principalOfficerName: lender.principalOfficerName,
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
      rateLabel: termLoan ? 'Interest rate' : 'Finance charge rate',
      rateText,
      methodNote,
      chargesPenaltyInterest: !renewing,
      breakdown,
    },
    // The standard preamble limits the agreement to loans of up to 5 months,
    // which a term loan is not.
    terms: termLoan
      ? {
          ...getTerms(loan.tcVersion ?? undefined),
          preamble: `This loan agreement applies to a term loan repaid in ${loan.instalmentsTotal} monthly instalments.`,
        }
      : getTerms(loan.tcVersion ?? undefined),
    tcAcceptedAt: loan.tcAcceptedAt,
    images,
    generatedAt,
  };
};
