'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { isBorrower, isLender } from '@loan-pilot/domain';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AppTopbar } from '@/components/app-topbar';
import { PortalShell } from '@/components/borrower/portal-shell';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import type { OverviewStats } from '@/lib/types';

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  const lender = Boolean(user && isLender(user.role));
  const { data: stats } = useApi<OverviewStats>(lender ? '/stats/overview' : null);
  const pendingCount = stats?.kind === 'lender' ? stats.pendingApplications : 0;

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isBorrower(user.role)) {
    return <PortalShell user={user}>{children}</PortalShell>;
  }

  return (
    <SidebarProvider>
      <AppSidebar user={user} pendingCount={pendingCount} />
      <SidebarInset>
        <AppTopbar />
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AppLayout;
