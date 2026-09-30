import { LoanType } from '@loan-pilot/domain';

/**
 * Raccoons' public identity and product line-up, as on raccoonsfinance.com
 * (apps/web/src/lib/site-data.ts). Keep the two in step.
 */
export const COMPANY = {
  name: 'Raccoons Financial Services',
  short: 'RFS',
  licence: 'NAMFISA Licence 25/11/1471',
  email: 'apply@raccoonsfinance.com',
  website: 'https://raccoonsfinance.com',
  phones: [
    {
      display: '+264 81 725 8138',
      tel: 'tel:+264817258138',
      whatsapp: 'https://wa.me/264817258138',
    },
    {
      display: '+264 81 692 6592',
      tel: 'tel:+264816926592',
      whatsapp: 'https://wa.me/264816926592',
    },
  ],
  address: 'Chaldeer street, Soweto, Windhoek',
} as const;

export interface Product {
  type: LoanType;
  title: string;
  blurb: string;
  term: string;
  collateral: string;
}

export const PRODUCTS: readonly Product[] = [
  {
    type: LoanType.Payday,
    title: 'Payday',
    blurb: 'Bridge an unexpected cost until payday. No collateral needed.',
    term: '1 month',
    collateral: 'No collateral',
  },
  {
    type: LoanType.Business,
    title: 'Business',
    blurb: 'Working capital for Namibian small businesses.',
    term: 'Up to 5 months',
    collateral: 'Collateral optional',
  },
  {
    type: LoanType.Collateral,
    title: 'Collateral',
    blurb: 'Larger amounts secured by an asset such as a vehicle.',
    term: 'Up to 5 months',
    collateral: 'Collateral required',
  },
];

export const LOAN_TYPE_LABEL: Record<LoanType, string> = {
  [LoanType.Payday]: 'Payday loan',
  [LoanType.Business]: 'Business loan',
  [LoanType.Collateral]: 'Collateral loan',
};
