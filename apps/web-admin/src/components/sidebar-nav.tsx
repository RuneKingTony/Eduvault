import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  NavIcon,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@eduvault/ui';
import { findCurrent, type NavGroup, type NavItem } from '../nav';
import { useApprovalsSummary } from './approvals/use-approvals-summary';
import { useCollapsedGroups } from './shell-state';

interface SidebarNavProps {
  groups: readonly NavGroup[];
  pathname: string;
  rail: boolean;
  onNavigate: () => void;
}

function useNavCounts(): Readonly<Record<string, number>> {
  const summary = useApprovalsSummary();
  return {
    approvals: summary?.byNav.approvals ?? 0,
    payments: summary?.byNav.payments ?? 0,
    store: summary?.byNav.store ?? 0,
    wallets: summary?.byNav.wallets ?? 0,
  };
}

function NavItems({
  group,
  pathname,
  groups,
  onNavigate,
}: {
  group: NavGroup;
  groups: readonly NavGroup[];
  pathname: string;
  onNavigate: () => void;
}) {
  const current = findCurrent(groups, pathname)?.item;
  const counts = useNavCounts();
  return (
    <SidebarMenu>
      {group.items.map((item) => (
        <NavMenuItem
          key={item.id}
          item={item}
          count={counts[item.id] ?? 0}
          active={current?.id === item.id}
          onNavigate={onNavigate}
        />
      ))}
    </SidebarMenu>
  );
}

function NavMenuItem({
  item,
  count,
  active,
  onNavigate,
}: {
  item: NavItem;
  count: number;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link
          to={item.route}
          aria-current={active ? 'page' : undefined}
          onClick={onNavigate}
        >
          <NavIcon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {count > 0 ? (
        <SidebarMenuBadge aria-label={`${count} waiting for you`}>
          {count}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
}

function LabelledGroup({
  group,
  label,
  open,
  onToggle,
  children,
}: {
  group: NavGroup;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <SidebarGroup data-group={group.id}>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger>
            {label}
            <ChevronDownIcon className="ml-auto transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function SidebarNav({
  groups,
  pathname,
  rail,
  onNavigate,
}: SidebarNavProps) {
  const { isCollapsed, toggle } = useCollapsedGroups();
  return (
    <>
      {groups.map((group) => {
        const items = (
          <NavItems
            group={group}
            groups={groups}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        );
        if (group.label === null) {
          return (
            <SidebarGroup key={group.id} className="mt-auto">
              <SidebarGroupContent>{items}</SidebarGroupContent>
            </SidebarGroup>
          );
        }
        if (rail) {
          return (
            <SidebarGroup key={group.id}>
              <SidebarSeparator className="mx-0" />
              <SidebarGroupContent>{items}</SidebarGroupContent>
            </SidebarGroup>
          );
        }
        return (
          <LabelledGroup
            key={group.id}
            group={group}
            label={group.label}
            open={!isCollapsed(group.id)}
            onToggle={() => {
              toggle(group.id);
            }}
          >
            {items}
          </LabelledGroup>
        );
      })}
    </>
  );
}
