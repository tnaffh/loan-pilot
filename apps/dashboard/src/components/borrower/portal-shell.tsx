'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import type { SessionUser } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { InitialsAvatar } from '@/components/initials-avatar';
import { useAuth } from '@/lib/auth-context';
import { useTenantBranding } from '@/lib/tenant-theme';

/** Topbar-only chrome for the borrower portal (no sidebar). */
export const PortalShell = ({ user, children }: { user: SessionUser; children: React.ReactNode }) => {
  const { logout } = useAuth();
  const branding = useTenantBranding();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[940px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              {branding?.short ?? 'LP'}
            </span>
            <span className="text-sm font-semibold">{branding?.name ?? 'LoanPilot'}</span>
          </Link>
          <div className="flex items-center gap-3">
            <InitialsAvatar name={user.name} />
            <Button variant="outline" size="icon-sm" onClick={logout} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[940px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
};
