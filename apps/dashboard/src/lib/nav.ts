import {
  Banknote,
  Building2,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { UserRole, isPlatform } from '@loan-pilot/domain';

export interface NavSubItem {
  href: string;
  label: string;
  /** When true, the shell renders the pending-applications count beside this item. */
  withBadge?: boolean;
}

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Leaf items link directly; parent items omit href and expand `items`. */
  href?: string;
  withBadge?: boolean;
  items?: NavSubItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const PLATFORM_NAV: NavGroup[] = [
  {
    label: 'Operate',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      { href: '/tenants', label: 'Tenants', icon: Building2 },
      { href: '/billing', label: 'Billing', icon: Receipt },
    ],
  },
];

const LENDER_NAV: NavGroup[] = [
  {
    label: 'Lending',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      {
        label: 'Loans',
        icon: Banknote,
        items: [
          { href: '/loans', label: 'All loans' },
          { href: '/applications', label: 'Applications', withBadge: true },
        ],
      },
      { href: '/borrowers', label: 'Borrowers', icon: Users },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/expenses', label: 'Expenses', icon: Wallet },
    ],
  },
];

const BORROWER_NAV: NavGroup[] = [
  {
    label: 'My account',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      { href: '/loans', label: 'My loans', icon: Banknote },
      { href: '/statements', label: 'Statements', icon: CreditCard },
    ],
  },
];

export const navForRole = (role: UserRole): NavGroup[] => {
  if (isPlatform(role)) {
    return PLATFORM_NAV;
  }
  if (role === UserRole.Borrower) {
    return BORROWER_NAV;
  }
  return LENDER_NAV;
};

const TITLES: { prefix: string; title: string }[] = [
  { prefix: '/applications', title: 'Applications' },
  { prefix: '/borrowers', title: 'Borrowers' },
  { prefix: '/loans', title: 'Loans' },
  { prefix: '/calendar', title: 'Calendar' },
  { prefix: '/expenses', title: 'Expenses' },
  { prefix: '/tenants', title: 'Tenants' },
  { prefix: '/billing', title: 'Billing' },
  { prefix: '/statements', title: 'Statements' },
  { prefix: '/', title: 'Overview' },
];

/** Page title for the topbar, by longest matching route prefix. */
export const titleForPath = (pathname: string): string => {
  const match = TITLES.find((entry) =>
    entry.prefix === '/' ? pathname === '/' : pathname.startsWith(entry.prefix),
  );
  return match?.title ?? 'Overview';
};
