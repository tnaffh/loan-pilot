/**
 * The NAMFISA-approved loan-agreement Terms & Conditions.
 *
 * Transcribed verbatim from the lender's registered loan agreement (the
 * Microlending Act, 2018 compliant document). Held as structured data — not one
 * HTML blob — so the exact same text is used in three places: displayed to the
 * applicant for reading/agreement (web + dashboard), embedded into the generated
 * agreement PDF, and pinned by version on the record. Because all three read
 * this one constant, "the terms shown", "the terms in the PDF", and "the terms
 * the borrower agreed to (by version)" can never drift apart.
 *
 * Bump {@link TERMS_VERSION} whenever the wording changes; keep prior versions
 * addressable via {@link getTerms} so historical agreements reproduce with the
 * text that was actually in force when they were signed.
 */

/** The version identifier recorded on every acceptance. Bump on any wording change. */
export const TERMS_VERSION = '2026-01';

/** Human-readable effective date for the current terms version. */
export const TERMS_EFFECTIVE_DATE = '2026-01-01';

/** A single numbered clause / annexure of the agreement. */
export interface TermsSection {
  /** e.g. "1. Confidentiality" or "Annexure A — Complaints Procedures". */
  readonly title: string;
  /** One or more paragraphs; rendered as separate blocks in both HTML and PDF. */
  readonly body: readonly string[];
}

/** A full, versioned set of terms. */
export interface Terms {
  readonly version: string;
  readonly effectiveDate: string;
  readonly preamble: string;
  readonly sections: readonly TermsSection[];
}

const PREAMBLE =
  'This loan agreement only applies to loans not exceeding a period of 5 months.';

const SECTIONS: readonly TermsSection[] = [
  {
    title: '1. Confidentiality',
    body: [
      'The microlender may not, without the express consent of the loan applicant / borrower and apart from disclosing relevant information to a registered credit bureau, disclose any confidential information obtained in the course of a microlending transaction other than if it is required by a court order from a court with competent jurisdiction; and',
      'The microlender may not, without the express written consent of the loan applicant / borrower, obtain from or to disclose to a third party, other than a registered credit bureau, the loan applicant / borrower’s credit record and payment history;',
    ],
  },
  {
    title: '2. Legal Costs',
    body: [
      'The microlender may not collect or attempt to collect legal costs in excess of costs allowed on a party and party scale in terms of the Magistrates’ Courts Act, 1944 (Act No. 32 of 1944) or the High Court Act, 1990 (Act No. 16 of 1990);',
    ],
  },
  {
    title: '3. Consent to Judgment and Emolument Attachment Orders',
    body: [
      'Any consent to judgment forms or emolument attachment orders obtained prior to the borrower defaulting, is considered void and not enforceable;',
    ],
  },
  {
    title: '4. Dispute Resolution',
    body: [
      'Complaints, which cannot be resolved between the microlender and the borrower, should be referred to NAMFISA. Attached is the complaints procedure, marked “Annexure A”, which forms part of the agreement;',
    ],
  },
  {
    title: '5. Cooling Off',
    body: [
      'The borrower may cancel the microlending transaction within three (3) business days after signing of the loan agreement, provided that the loan amount and pro rata finance charges in terms of section 26(2) of the Act at the rate applicable to that microlending transaction, be repaid simultaneously;',
    ],
  },
  {
    title: '6. Prepayment of Instalments and Principal Debt',
    body: [
      'The borrower may make additional payments or settle the outstanding balance early in one or more payments without any penalties being levied for early settlement and that the microlender may, in such event, only stipulate for demand or receive from the borrower pro rata finance charges at the rate applicable to that microlending transaction;',
    ],
  },
  {
    title: '7. The Whole Contract',
    body: [
      'No addition to or variation of the agreement shall be of any force and effect unless the change reduces the borrower’s liabilities under the agreement or the change is recorded in writing and signed by both parties; and',
    ],
  },
  {
    title: '8. Governing Law',
    body: ['The agreement shall be governed in all respects by the laws of the Republic of Namibia.'],
  },
  {
    title: '9. Disclosure',
    body: [
      '9.1. The microlender must, at every licensed premises where the microlender conducts the microlending business –',
      '9.1.1. keep available a copy of the Microlending Act, 2018 (Act No. 7 of 2018) (“the Act”), the regulations and the standards issued under the Act which must, on request, be made available to the loan applicant or borrower for perusal. The microlender must further draw the attention of the loan applicant or borrower to section 23 of the Act, which provides for prohibited conduct of a microlender;',
      '9.1.2. keep available a copy of the complaint procedures as required by the standards, which must be made available to the borrower on request;',
      '9.1.3. keep available copies of the complaint intake forms as required by the standards, which must be made available to the borrower on request;',
      '9.1.4. display prominently, in the form of an A3 poster, the complaint Procedures as required by the standards;',
      '9.1.5. display in a form required by the standards the maximum finance charges determined by the Registrar in terms of the Usury Act; and',
      '9.1.6. display prominently the registration certificate of the microlender issued by NAMFISA.',
      '9.2. The microlender must, before the conclusion of the microlending transaction –',
      '9.2.1. Provide the loan applicant with a schedule in writing setting out – the principal debt in Namibia Dollars and cents; the amount of finance charges in Namibia Dollars and cents at the applicable rate over the repayment period and the elements comprising the finance charges; the total amount repayable in Namibia Dollars and cents at the then current interest rate, over the repayment period; the finance charge rate, whether this is fixed or variable and, if variable, how it may vary; the nature and amount of any insurance, if required, including the name of the insurer and the amount of the premiums payable; the penalty interest and any additional costs that would become payable in the case of default by the loan applicant and how that would be calculated; the instalment amount in Namibia Dollars and cents, at the then current interest rate, and the number of instalments; the period of the microlending transaction; and any other costs and expenses;',
      '9.2.2. explain to the loan applicant the terms and conditions of the agreement in a language which the loan applicant understands, if necessary with the assistance of an interpreter provided by the loan applicant, so as to ensure that the meaning and consequences of the agreement are understood; and',
      '9.2.3. allow the loan applicant an opportunity to read the agreement, or have it read to the loan applicant if he or she is illiterate.',
      '9.2.4. The microlender must, after the conclusion of the microlending transaction – provide the borrower, at no cost, with a copy of the signed loan agreement before or at the time of advancing and, if applicable, a copy of the insurance contract pertaining to the microlending transaction; and provide the borrower with a written or electronic statement, the frequency and the costs of which is to be as required by the standards, of his or her loan position setting out all the charges levied, all the payments made and the balance outstanding.',
      '9.2.5. The microlender must, at the request of the borrower, provide the borrower with a statement setting out all the charges levied, all the payments made and the balance outstanding, and may impose a charge for the provision of a duplicate copy of the statement but in no case may the charge exceed the amount per page of the statement as required by the standards.',
      '9.2.6. If the microlender refuses to approve a loan application based on the reason of an adverse credit record, then the name and details of the credit bureau must be provided to the loan applicant so as to enable the loan applicant to check the accuracy of the credit information held by the credit bureau.',
      '9.2.7. The microlender must, at least 28 days before the microlender forwards any adverse information on the borrower to a credit bureau, which information will be capable of being accessed by subscribers to the credit bureau, inform the borrower by way of a notice addressed to the chosen address of the borrower of the intention of the microlender to do so.',
    ],
  },
  {
    title: 'Annexure A — Complaints Procedures',
    body: [
      'The Namibia Financial Institutions Supervisory Authority (NAMFISA) regulates and supervises financial institutions, including microlenders. Microlenders are regulated under the provisions of the Microlending Act. The inspection of microlenders is coordinated in accordance with the Inspection of Financial Institutions Act, 1984 (Act No. 38 of 1984).',
      'If a microlender has treated you unfairly, you may complain to NAMFISA by filling out a Complaint Intake Form. You can get a Complaint Intake Form from your microlender. Please ask for a form.',
      'PLEASE FOLLOW THESE STEPS BEFORE MAKING A COMPLAINT WITH NAMFISA',
      'Step I: First, take up the matter with the frontline staff of the Microlender. State the problem and ask for a solution. Specifically ask if the staff is able to resolve the complaint.',
      'Step II: If the staff is unable to resolve the complaint, make an appointment with the Principal Officer/Owner of the Microlending business. Put the problem in writing, ask for a solution within a certain period and hand the complaint to the Principal Officer/Owner at the day of the meeting. If the Principal Officer/Owner does not want to meet you or cannot give you a date within a reasonable time for a meeting, go to Step III.',
      'Step III: If the microlender fails to reply or the complainant is not satisfied with the reply, or could not meet with the Principal Officer/Owner: Complete a Complaint Intake Form. Give the Complaint Intake Form plus any relevant supporting documents to the Consumer Complaints and Education Department of NAMFISA. Should you want to make the complaint by e-mail, send it to info@namfisa.com.na and mail the relevant supporting documentation to NAMFISA at the following postal address: The Registrar, NAMFISA, P O Box 21250, Windhoek, NAMIBIA.',
      'Alternatively, bring the supporting documentation personally to: The Registrar, NAMFISA, 27 Fidel Castro St, Alexander Forbes House, 2nd Floor, Independence Avenue, WINDHOEK. Refer to the e-mail complaint, particularly the date when it was sent. NAMFISA shall study the complaint and inform the complainant of the appropriate action.',
    ],
  },
];

const CURRENT_TERMS: Terms = {
  version: TERMS_VERSION,
  effectiveDate: TERMS_EFFECTIVE_DATE,
  preamble: PREAMBLE,
  sections: SECTIONS,
};

/** The full current Terms & Conditions. */
export const TERMS_AND_CONDITIONS: Terms = CURRENT_TERMS;

/**
 * Resolve a specific version of the terms. Only the current version is held in
 * code today; older `version` values fall back to the current text (historical
 * versions can be added here as the wording evolves). Passing no version returns
 * the current terms.
 */
export const getTerms = (version?: string): Terms => {
  // When historical versions are introduced, branch on `version` here.
  if (version && version !== TERMS_VERSION) {
    return { ...CURRENT_TERMS, version };
  }
  return CURRENT_TERMS;
};
