import { LoanType } from '@loan-pilot/domain';

/** Canonical public origin of the marketing site, used for metadataBase,
 * canonical URLs, sitemap, robots and structured data. Override per environment
 * with NEXT_PUBLIC_SITE_URL. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://raccoonsfinance.com').replace(
  /\/+$/,
  '',
);

/** One-line value proposition reused across metadata and structured data. */
export const SITE_DESCRIPTION =
  'Fair, transparent short-term loans for Namibians. Registered microlender regulated by NAMFISA. Every cost shown before you sign.';

export const COMPANY = {
  name: 'Raccoons Financial Services',
  legalName: 'Raccoons Financial Services CC',
  short: 'RFS',
  licence: 'NAMFISA Licence 25/11/1471',
  email: 'apply@raccoonsfinance.com',
  // Both numbers are reachable on WhatsApp Business and for normal calls.
  phones: [
    { display: '+264 81 725 8138', tel: 'tel:+264817258138', whatsapp: 'https://wa.me/264817258138' },
    { display: '+264 81 692 6592', tel: 'tel:+264816926592', whatsapp: 'https://wa.me/264816926592' },
  ],
  address: 'Erf 3026, Chaldeer street, Soweto, Windhoek',
  town: 'Windhoek, Namibia',
} as const;

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/loans', label: 'Loans' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export interface Product {
  id: string;
  type: LoanType;
  title: string;
  blurb: string;
  term: string;
  collateral: string;
}

export const PRODUCTS: Product[] = [
  {
    id: 'payday',
    type: LoanType.Payday,
    title: 'Payday & short-term',
    blurb:
      'Bridge an unexpected cost — medical, school fees or an emergency — repaid over one to five months, no collateral needed.',
    term: '1–5 months',
    collateral: 'None',
  },
  {
    id: 'business',
    type: LoanType.Business,
    title: 'Business & SME',
    blurb:
      'Working capital and growth funding for Namibian small businesses, with terms shaped around your cash flow.',
    term: 'Up to 5 months',
    collateral: 'Optional',
  },
  {
    id: 'collateral',
    type: LoanType.Collateral,
    title: 'Collateral-backed',
    blurb: 'Larger, secured amounts backed by an asset such as a vehicle or property.',
    term: 'Up to 5 months',
    collateral: 'Required',
  },
];

export const TRUST_STATS = [
  { value: '2019', label: 'Proudly Namibian, established' },
  { value: '3', label: 'Loan types to choose from' },
  { value: '50%+', label: 'Take-home pay always protected' },
];

export const REQUIREMENTS = [
  'A recent pay slip, showing consistent income.',
  "A certified copy of the applicant's ID or passport.",
  'Bank statements from the last 3 months.',
];
