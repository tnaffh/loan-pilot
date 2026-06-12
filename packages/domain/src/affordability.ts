import type { Cents } from './money';
import { AffordabilityResult } from './enums';

/**
 * Responsible-lending rule from the Raccoons company profile: a borrower must
 * retain at least 50% of their income after all loan obligations. We grade the
 * total debt-service ratio (existing obligations + the new instalment).
 */
export const MAX_PASS_RATIO = 0.5;
export const MAX_REVIEW_RATIO = 0.6;

export interface AffordabilityInput {
  /** Gross monthly income, in cents. */
  readonly monthlyIncomeCents: Cents;
  /** Existing monthly loan/debt obligations, in cents. */
  readonly existingObligationsCents?: Cents;
  /** The proposed new monthly instalment, in cents. */
  readonly instalmentCents: Cents;
}

export interface AffordabilityAssessment {
  readonly result: AffordabilityResult;
  /** Total debt-service ratio, rounded to 4 decimals. */
  readonly ratio: number;
  readonly disposableIncomeCents: Cents;
}

/**
 * Assess affordability. `pass` when the borrower keeps >= 50% of income,
 * `review` up to 60%, otherwise `fail`.
 */
export const assessAffordability = ({
  monthlyIncomeCents,
  existingObligationsCents = 0,
  instalmentCents,
}: AffordabilityInput): AffordabilityAssessment => {
  if (monthlyIncomeCents <= 0) {
    return { result: AffordabilityResult.Fail, ratio: 1, disposableIncomeCents: 0 };
  }

  const totalObligations = existingObligationsCents + instalmentCents;
  const ratio = Math.round((totalObligations / monthlyIncomeCents) * 10000) / 10000;
  const disposableIncomeCents = monthlyIncomeCents - totalObligations;

  const result =
    ratio <= MAX_PASS_RATIO
      ? AffordabilityResult.Pass
      : ratio <= MAX_REVIEW_RATIO
        ? AffordabilityResult.Review
        : AffordabilityResult.Fail;

  return { result, ratio, disposableIncomeCents };
};
