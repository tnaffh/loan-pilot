import {
  Banknote,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { UserRole, isPlatform } from '@loan-pilot/domain';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PLATFORM_NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/tenants', label: 'Tenants', icon: Building2 },
  { href: '/billing', label: 'Billing', icon: Receipt },
];

const LENDER_NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/applications', label: 'Applications', icon: FileText },
  { href: '/borrowers', label: 'Borrowers', icon: Users },
  { href: '/loans', label: 'Loans', icon: Banknote },
];

const BORROWER_NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/loans', label: 'My loans', icon: Banknote },
  { href: '/statements', label: 'Statements', icon: CreditCard },
];

export const navForRole = (role: UserRole): NavItem[] => {
  if (isPlatform(role)) {
    return PLATFORM_NAV;
  }
  if (role === UserRole.Borrower) {
    return BORROWER_NAV;
  }
  return LENDER_NAV;
};
