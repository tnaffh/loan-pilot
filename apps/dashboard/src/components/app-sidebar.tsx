'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { SessionUser } from '@loan-pilot/domain';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { NavUser } from '@/components/nav-user';
import { navForRole, type NavItem } from '@/lib/nav';
import { useTenantBranding } from '@/lib/tenant-theme';

/**
 * One expandable nav group. Controlled (not `defaultOpen`) so the open state can
 * follow the active route without Base UI warning about a changing default —
 * the group is forced open while one of its routes is active, and the user can
 * toggle it otherwise.
 */
const CollapsibleNavItem = ({
  item,
  active,
  pendingCount,
  isActive,
}: {
  item: NavItem;
  active: boolean;
  pendingCount: number;
  isActive: (href: string) => boolean;
}) => {
  const [open, setOpen] = useState(active);
  const subItems = item.items ?? [];

  return (
    <Collapsible
      open={open || active}
      onOpenChange={setOpen}
      className="group/collapsible"
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        render={
          <SidebarMenuButton tooltip={item.label} className="h-9 text-[15px] [&>svg]:size-[18px]" />
        }
      >
        <item.icon />
        <span>{item.label}</span>
        {subItems.some((sub) => sub.withBadge) && pendingCount > 0 ? (
          <SidebarMenuBadge className="mr-5">{pendingCount}</SidebarMenuBadge>
        ) : null}
        <ChevronRight className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {subItems.map((sub) => (
            <SidebarMenuSubItem key={sub.href}>
              <SidebarMenuSubButton
                isActive={isActive(sub.href)}
                className="h-8 text-[14px]"
                render={<Link href={sub.href} />}
              >
                <span>{sub.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const AppSidebar = ({ user, pendingCount }: { user: SessionUser; pendingCount: number }) => {
  const pathname = usePathname();
  const branding = useTenantBranding();
  const groups = navForRole(user.role);

  const tenantName = branding?.name ?? 'LoanPilot';
  const tenantShort = branding?.short ?? 'LP';
  const tenantPlan = branding ? `${branding.plan} plan` : 'Platform console';

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const itemActive = (item: NavItem) =>
    Boolean(item.href && isActive(item.href)) ||
    Boolean(item.items?.some((sub) => isActive(sub.href)));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Current lender identity (one lender per user, so no switcher). */}
        <div className="flex items-center gap-2 px-1 py-1.5">
          <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <span className="text-xs font-semibold">{tenantShort}</span>
          </div>
          <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">{tenantName}</span>
            <span className="truncate text-xs capitalize text-muted-foreground">{tenantPlan}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) =>
                item.items ? (
                  <CollapsibleNavItem
                    key={item.label}
                    item={item}
                    active={itemActive(item)}
                    pendingCount={pendingCount}
                    isActive={isActive}
                  />
                ) : (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      isActive={item.href ? isActive(item.href) : false}
                      className="h-9 text-[15px] [&>svg]:size-[18px]"
                      render={
                        <Link href={item.href ?? '#'}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      }
                    />
                    {item.withBadge && pendingCount > 0 ? (
                      <SidebarMenuBadge>{pendingCount}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ),
              )}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
