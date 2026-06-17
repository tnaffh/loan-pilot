'use client';

import { usePathname } from 'next/navigation';
import { Bell, LogOut, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/lib/auth-context';
import { titleForPath } from '@/lib/nav';

export const AppTopbar = () => {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
      <SidebarTrigger className="md:hidden" />
      <h1 className="font-heading text-xl font-semibold tracking-tight">{titleForPath(pathname)}</h1>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search loans, borrowers…"
            className="h-9 w-56 rounded-lg border bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
        </div>
        <Button variant="outline" size="icon-sm" className="relative" aria-label="Notifications">
          <Bell />
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-bad" />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={logout} aria-label="Sign out">
          <LogOut />
        </Button>
      </div>
    </header>
  );
};
