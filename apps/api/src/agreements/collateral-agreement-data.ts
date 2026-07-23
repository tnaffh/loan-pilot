import { formatNad, getCollateralTerms, type Terms } from '@loan-pilot/domain';
import type { LenderIdentity } from '../settings/settings.service';
import { toAgreementData, type AgreementData, type AgreementLoan } from './agreement-data';

/** Display-ready data for a collateral (pledge) agreement. Reuses the loan
 * agreement's shared lender/borrower/loan blocks (`base`) and adds the pledged
 * asset, its photos, and the collateral terms. */
export interface CollateralAgreementData {
  base: AgreementData;
  collateral: {
    item: string;
    identifier: string;
    description: string;
    condition: string;
    estimatedValue: string | null;
  };
  /** Embedded photo bytes (JPEG/PNG), already capped/filtered by the caller. */
  photos: Buffer[];
  terms: Terms;
}

export const toCollateralAgreementData = (
  loan: AgreementLoan,
  lender: LenderIdentity,
  penaltyMonthlyRate: number,
  signaturePng: Buffer | null,
  logoPng: Buffer | null,
  photos: Buffer[],
  generatedAt: Date,
): CollateralAgreementData => ({
  base: toAgreementData(loan, lender, penaltyMonthlyRate, signaturePng, logoPng, generatedAt),
  collateral: {
    item: loan.collateralItem ?? '',
    identifier: loan.collateralIdentifier ?? '',
    description: loan.collateralDescription ?? '',
    condition: loan.collateralCondition ?? '',
    estimatedValue: loan.collateralValue != null ? formatNad(loan.collateralValue) : null,
  },
  photos,
  terms: getCollateralTerms(),
});
