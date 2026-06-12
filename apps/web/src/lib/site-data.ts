import { LoanType } from '@loan-pilot/domain';

export const COMPANY = {
  name: 'Raccoons Financial Services',
  legalName: 'Raccoons Financial Services CC',
  short: 'RFS',
  licence: 'NAMFISA Licence 25/11/1471',
  email: 'racoonsfs@gmail.com',
  whatsapp: '+264 81 725 8138',
  whatsappHref: 'https://wa.me/264817258138',
  phone: '+264 81 692 6592',
  phoneHref: 'tel:+264816926592',
  address: 'Erf 863, Otjomuise Lifestyle, Stockholm Street, Windhoek',
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
