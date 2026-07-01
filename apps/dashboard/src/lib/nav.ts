import {
  Banknote,
  Building2,
  CalendarDays,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { UserRole, can, isPlatform, type SessionUser } from '@loan-pilot/domain';

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
      { href: '/users', label: 'Users', icon: ShieldCheck },
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

/** Nav for a user, with the Admin group's items gated by granular permissions. */
export const navForUser = (user: SessionUser): NavGroup[] => {
  if (isPlatform(user.role)) {
    return PLATFORM_NAV;
  }
  if (user.role === UserRole.Borrower) {
    return BORROWER_NAV;
  }
  const adminItems: NavItem[] = [];
  if (can(user, 'finance:read')) {
    adminItems.push({ href: '/expenses', label: 'Finance', icon: Wallet });
  }
  if (can(user, 'users:manage')) {
    adminItems.push({ href: '/users', label: 'Users', icon: ShieldCheck });
  }
  if (can(user, 'roles:manage')) {
    adminItems.push({ href: '/roles', label: 'Roles', icon: KeyRound });
  }
  if (can(user, 'settings:read')) {
    adminItems.push({ href: '/settings', label: 'Rates & fees', icon: SlidersHorizontal });
  }
  return adminItems.length > 0 ? [...LENDER_NAV, { label: 'Admin', items: adminItems }] : LENDER_NAV;
};

const TITLES: { prefix: string; title: string }[] = [
  { prefix: '/applications', title: 'Applications' },
  { prefix: '/borrowers', title: 'Borrowers' },
  { prefix: '/loans', title: 'Loans' },
  { prefix: '/calendar', title: 'Calendar' },
  { prefix: '/expenses', title: 'Finance' },
  { prefix: '/tenants', title: 'Tenants' },
  { prefix: '/users', title: 'Users' },
  { prefix: '/roles', title: 'Roles' },
  { prefix: '/settings', title: 'Rates & fees' },
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
