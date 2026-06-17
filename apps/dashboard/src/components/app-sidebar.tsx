'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Send } from 'lucide-react';
import { isPlatform, type SessionUser } from '@loan-pilot/domain';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { InitialsAvatar } from '@/components/initials-avatar';
import { navForRole } from '@/lib/nav';
import { useTenantBranding } from '@/lib/tenant-theme';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  platform: 'Platform operator',
  lender_admin: 'Principal officer',
  lender_staff: 'Loan officer',
  borrower: 'Borrower',
};

export const AppSidebar = ({
  user,
  pendingCount,
}: {
  user: SessionUser;
  pendingCount: number;
}) => {
  const pathname = usePathname();
  const branding = useTenantBranding();
  const groups = navForRole(user.role);
  const platform = isPlatform(user.role);

  const workspaceName = branding?.name ?? 'LoanPilot';
  const workspaceShort = branding?.short ?? 'LP';
  const workspaceSub = branding ? `${branding.plan} plan` : 'Platform console';

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-[#4f46e5] text-white">
            <Send className="size-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Loan<span className="text-primary">Pilot</span>
          </span>
        </Link>

        <div className="flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            {workspaceShort}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">{workspaceName}</div>
            <div className="truncate text-xs capitalize text-sidebar-foreground/70">
              {workspaceSub}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        render={
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        }
                      />
                      {item.withBadge && pendingCount > 0 ? (
                        <SidebarMenuBadge className={cn(active ? 'text-current' : 'text-primary')}>
                          {pendingCount}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-2.5">
          <InitialsAvatar name={platform ? 'LoanPilot' : user.name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium leading-tight">{user.name}</div>
            <div className="truncate text-xs text-sidebar-foreground/70">
              {ROLE_LABELS[user.role] ?? user.role}
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
