import type { Terms, TermsSection } from './terms';

/**
 * Terms & Conditions for the collateral (pledge) agreement — the security
 * contract that accompanies a collateral loan.
 *
 * ⚠️ DRAFT: these clauses are standard pledge/security terms drafted for
 * LoanPilot, NOT a regulator-approved document. Have a Namibian legal
 * practitioner review and adjust the wording before using this in production.
 * Bump {@link COLLATERAL_TERMS_VERSION} on any wording change; historical
 * versions stay reproducible via {@link getCollateralTerms}.
 *
 * Structured the same way as the loan-agreement terms (`terms.ts`) so the shared
 * PDF clause renderer draws them without any special-casing.
 */

export const COLLATERAL_TERMS_VERSION = '2026-01';
export const COLLATERAL_TERMS_EFFECTIVE_DATE = '2026-01-01';

const PREAMBLE =
  'This collateral agreement secures the loan described above and forms part of the microlending ' +
  'transaction between the Lender and the Borrower.';

const SECTIONS: readonly TermsSection[] = [
  {
    title: '1. Grant of Security',
    body: [
      'The Borrower hereby pledges and cedes to the Lender, as continuing security for the due repayment ' +
        'of the loan (including finance charges, permitted fees and any default interest), the movable ' +
        'asset described in this agreement ("the Collateral").',
    ],
  },
  {
    title: '2. Ownership and Warranties',
    body: [
      'The Borrower warrants that they are the sole and lawful owner of the Collateral, that it is free of ' +
        'any other pledge, lien or encumbrance, and that they have full right and authority to pledge it as ' +
        'security under this agreement.',
    ],
  },
  {
    title: '3. Care, Insurance and Use',
    body: [
      'Unless the Collateral is delivered into the Lender’s possession, the Borrower shall keep the ' +
        'Collateral in good condition, at their own cost, and shall not sell, lease, remove from Namibia, ' +
        'or otherwise dispose of it without the Lender’s prior written consent. The Borrower remains liable ' +
        'for any loss, damage or depreciation of the Collateral while the loan is outstanding.',
    ],
  },
  {
    title: '4. No Substitution',
    body: [
      'The Collateral may not be substituted, exchanged or replaced without the prior written consent of ' +
        'the Lender.',
    ],
  },
  {
    title: '5. Default and Realisation',
    body: [
      'If the Borrower defaults on the loan, the Lender may, subject to and in accordance with the laws of ' +
        'the Republic of Namibia, take possession of the Collateral and sell or otherwise realise it to ' +
        'recover the outstanding amount, together with any lawful costs of recovery and sale.',
      'The net proceeds of any such sale shall be applied to the outstanding amount. Any surplus shall be ' +
        'paid to the Borrower, and the Borrower remains liable for any shortfall that remains after the ' +
        'proceeds have been applied.',
    ],
  },
  {
    title: '6. Release',
    body: [
      'Upon full and final settlement of the loan, this security shall lapse and the Lender shall release ' +
        'the Collateral and return possession of it (where held) to the Borrower.',
    ],
  },
  {
    title: '7. Governing Law',
    body: [
      'This collateral agreement shall be governed in all respects by the laws of the Republic of Namibia ' +
        'and shall be read together with the loan agreement it secures.',
    ],
  },
];

const CURRENT_TERMS: Terms = {
  version: COLLATERAL_TERMS_VERSION,
  effectiveDate: COLLATERAL_TERMS_EFFECTIVE_DATE,
  preamble: PREAMBLE,
  sections: SECTIONS,
};

/** The full current collateral (pledge) Terms & Conditions. */
export const COLLATERAL_TERMS_AND_CONDITIONS: Terms = CURRENT_TERMS;

/** Resolve a version of the collateral terms (current only, today). */
export const getCollateralTerms = (version?: string): Terms => {
  if (version && version !== COLLATERAL_TERMS_VERSION) {
    return { ...CURRENT_TERMS, version };
  }
  return CURRENT_TERMS;
};
