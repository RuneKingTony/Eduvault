import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Outlet,
  linkOptions,
  useRouteContext,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import type { MePermissions } from '@eduvault/api-contract';
import { PermissionsProvider } from '@eduvault/auth-client';
import { FINANCE_READ_GATE, canAny, type Gate } from '@eduvault/policy';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Sidebar,
  SidebarProvider,
  TooltipProvider,
  cn,
  useIsCompact,
} from '@eduvault/ui';
import { useActing, type ActingState } from '../acting-store';
import { useCanAdmit } from '../admission-rules';
import { NO_ADJUSTMENT_SEARCH } from '../adjustments-search';
import { useApi } from '../api';
import { mePermissionsQueryOptions } from '../queries';
import { prepareChargesTarget, searchFor } from '../route-search-defaults';
import {
  EXTRA_PAGE_TITLES,
  NAV_GROUPS,
  SETTINGS_SECTIONS,
  findCurrent,
  settingsTrail,
  visibleNav,
  visibleSettings,
  type NavGroup,
} from '../nav';
import {
  CommandMenu,
  type CommandEntry,
  type CommandTarget,
} from './command-menu';
import { MyAccessProvider, useMyAccess } from './my-access';
import { ShellSidebar } from './shell-sidebar';
import { useRailOpen } from './shell-state';
import { ActingBanner } from './acting-banner';
import { ShellTopbar } from './shell-topbar';
import { useCommandShortcut } from './use-command-shortcut';

function commandEntries(groups: readonly NavGroup[]): CommandEntry[] {
  return groups
    .filter((group) => group.label !== null)
    .flatMap((group) =>
      group.items.map((item) => ({
        id: item.id,
        label: item.pageTitle,
        hint: group.label ?? '',
        target: { to: item.route },
        icon: item.icon,
        keywords: [item.label],
      }))
    );
}

/** Cached access may only seed a key it was fetched for, or it would outlive a switch. */
const matchesActing = (access: MePermissions, acting: ActingState | null) =>
  acting === null
    ? access.acting === null
    : access.acting?.organizationId === acting.organizationId &&
      access.acting.writes === (acting.reason !== null);

const ADD_MEMBER_ACTION: CommandEntry = {
  id: 'add-member',
  label: 'Add a staff member',
  hint: 'People',
  target: linkOptions({ to: '/members', search: { add: 1 } }),
  icon: 'user-round-plus',
  keywords: ['new', 'hire', 'invite', 'staff', 'member'],
};

const ADMIT_STUDENT_ACTION: CommandEntry = {
  id: 'admit-student',
  label: 'Admit a student',
  hint: 'People',
  target: linkOptions({ to: '/students', search: { admit: 1 } }),
  icon: 'user-plus',
  keywords: ['new', 'student', 'enrol', 'enroll', 'admission'],
};

const CREATE_ROLE_ACTION: CommandEntry = {
  id: 'create-role',
  label: 'Create a custom role',
  hint: 'Roles',
  target: linkOptions({ to: '/roles/new' }),
  icon: 'shield-check',
  keywords: ['new', 'role', 'permissions', 'access'],
};

const ADD_FEE_ACTION: CommandEntry = {
  id: 'add-fee',
  label: 'Add a fee we charge',
  hint: 'Fees',
  target: linkOptions({ to: '/finance/school-fees', search: { add: 1 } }),
  icon: 'wallet',
  keywords: ['new', 'fee', 'levy', 'tuition', 'amount', 'charge'],
};

const CHARGE_STUDENTS_ACTION: CommandEntry = {
  id: 'charge-students',
  label: 'Charge students',
  hint: 'Fees',
  target: linkOptions(prepareChargesTarget()),
  icon: 'wallet',
  keywords: ['bill', 'invoice', 'charge', 'term', 'fees', 'send'],
};

const RECORD_PAYMENT_ACTION: CommandEntry = {
  id: 'record-payment',
  label: 'Record a payment',
  hint: 'Finance',
  target: linkOptions({
    to: '/finance/payments',
    search: searchFor('/finance/payments', { record: 1 }),
  }),
  icon: 'banknote',
  keywords: ['receipt', 'cash', 'transfer', 'pos', 'paid', 'fees'],
};

const DISCOUNT_OR_REFUND_ACTION: CommandEntry = {
  id: 'discount-or-refund',
  label: 'Discount or refund',
  hint: 'Finance',
  target: linkOptions({
    to: '/finance/adjustments',
    search: { ...NO_ADJUSTMENT_SEARCH, new: 1 },
  }),
  icon: 'wallet',
  keywords: [
    'refund',
    'discount',
    'scholarship',
    'reduce',
    'write off',
    'credit',
  ],
};

const WHO_OWES_ACTION: CommandEntry = {
  id: 'who-owes',
  label: 'See who owes fees',
  hint: 'Fees',
  target: linkOptions({
    to: '/finance/accounts',
    search: searchFor('/finance/accounts'),
  }),
  icon: 'wallet',
  keywords: ['balance', 'debt', 'owing', 'statement', 'arrears'],
};

function commandActions(
  builtRoutes: ReadonlySet<string>,
  access: MePermissions,
  canAdmitStudent: boolean
): CommandEntry[] {
  const built = ({ target: { to } }: CommandEntry) =>
    to !== undefined && builtRoutes.has(to);
  const allowed = (action: CommandEntry, gate: Gate) =>
    built(action) && canAny(access.permissions, gate);
  return [
    ...(built(ADMIT_STUDENT_ACTION) && canAdmitStudent
      ? [ADMIT_STUDENT_ACTION]
      : []),
    ...(allowed(ADD_MEMBER_ACTION, ['member:create'])
      ? [ADD_MEMBER_ACTION]
      : []),
    ...(allowed(ADD_FEE_ACTION, ['feeLine:create']) ? [ADD_FEE_ACTION] : []),
    ...(allowed(CHARGE_STUDENTS_ACTION, ['invoice:bill'])
      ? [CHARGE_STUDENTS_ACTION]
      : []),
    ...(allowed(RECORD_PAYMENT_ACTION, ['payment:record'])
      ? [RECORD_PAYMENT_ACTION]
      : []),
    ...(allowed(DISCOUNT_OR_REFUND_ACTION, ['adjustment:create'])
      ? [DISCOUNT_OR_REFUND_ACTION]
      : []),
    ...(allowed(WHO_OWES_ACTION, FINANCE_READ_GATE) ? [WHO_OWES_ACTION] : []),
    ...(allowed(CREATE_ROLE_ACTION, ['ac:create']) ? [CREATE_ROLE_ACTION] : []),
  ];
}

function useAccess(): MePermissions {
  const router = useRouter();
  const api = useApi();
  const { access } = useRouteContext({ from: '__root__' });
  if (access === null) {
    throw new Error('The school shell needs school access');
  }
  const acting = useActing();
  const { data } = useQuery({
    ...mePermissionsQueryOptions(api, acting),
    ...(matchesActing(access, acting)
      ? { initialData: access }
      : { placeholderData: access }),
  });
  const previous = useRef(data);
  useEffect(() => {
    if (previous.current !== data) {
      previous.current = data;
      void router.invalidate();
    }
  }, [data, router]);
  return data ?? access;
}

function settingsEntries(
  builtRoutes: ReadonlySet<string>,
  access: MePermissions
): CommandEntry[] {
  return visibleSettings(
    SETTINGS_SECTIONS,
    builtRoutes,
    access.permissions
  ).map((section) => ({
    id: section.id,
    label: section.label,
    hint: 'Settings',
    target: { to: section.route },
    icon: section.icon,
  }));
}

const titleOf = (current: ReturnType<typeof findCurrent>, pathname: string) =>
  current?.item.pageTitle ?? EXTRA_PAGE_TITLES[pathname] ?? 'Not found';

function crumbs(current: ReturnType<typeof findCurrent>, pathname: string) {
  const trail = settingsTrail(pathname);
  if (trail !== undefined) {
    return { groupLabel: trail.group, pageTitle: trail.title };
  }
  return {
    groupLabel: current?.group.label ?? undefined,
    pageTitle: titleOf(current, pathname),
  };
}

function useShellModel(access: MePermissions) {
  const router = useRouter();
  const canAdmitStudent = useCanAdmit();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const builtRoutes = new Set(Object.keys(router.routesByPath));
  const groups = visibleNav(NAV_GROUPS, builtRoutes, access.permissions);
  const current = findCurrent(groups, pathname);
  return {
    groups,
    pathname,
    current,
    pages: commandEntries(groups),
    settings: settingsEntries(builtRoutes, access),
    actions: commandActions(builtRoutes, access, canAdmitStudent),
    ...crumbs(current, pathname),
    open: (target: CommandTarget) => {
      void router.navigate(target);
    },
  };
}

export function PhoneNav({
  open,
  onOpenChange,
  description = 'Pages in this school.',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-72 bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <Sidebar collapsible="none" className="w-full">
          {children}
        </Sidebar>
      </SheetContent>
    </Sheet>
  );
}

export function ShellMain({
  compact,
  pathname,
}: {
  compact: boolean;
  pathname: string;
}) {
  return (
    <main
      className={cn(
        'mx-auto w-full max-w-310 flex-1',
        compact ? 'p-4 pb-18' : 'p-6'
      )}
    >
      <div key={pathname} className="flex page-reveal flex-col gap-5">
        <Outlet />
      </div>
    </main>
  );
}

type ShellModel = ReturnType<typeof useShellModel>;

function ShellNavigation({
  model,
  compact,
  railOpen,
  navOpen,
  onNavOpenChange,
  onOpenCommandMenu,
}: {
  model: ShellModel;
  compact: boolean;
  railOpen: boolean;
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  onOpenCommandMenu: () => void;
}) {
  const { openMyAccess } = useMyAccess();
  const sidebar = (
    <ShellSidebar
      groups={model.groups}
      pathname={model.pathname}
      rail={!compact && !railOpen}
      onNavigate={() => {
        onNavOpenChange(false);
      }}
      onOpenMyAccess={() => {
        onNavOpenChange(false);
        openMyAccess();
      }}
      onOpenCommandMenu={() => {
        onNavOpenChange(false);
        onOpenCommandMenu();
      }}
    />
  );
  return compact ? (
    <PhoneNav open={navOpen} onOpenChange={onNavOpenChange}>
      {sidebar}
    </PhoneNav>
  ) : (
    <Sidebar collapsible="icon">{sidebar}</Sidebar>
  );
}

export function AppShell() {
  const access = useAccess();
  return (
    <PermissionsProvider value={access}>
      <MyAccessProvider>
        <ShellFrame access={access} />
      </MyAccessProvider>
    </PermissionsProvider>
  );
}

function ShellFrame({ access }: { access: MePermissions }) {
  const compact = useIsCompact();
  const [railOpen, setRailOpen] = useRailOpen();
  const [navOpen, setNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const model = useShellModel(access);
  const toggleCommand = useCallback(() => {
    setCommandOpen((open) => !open);
  }, []);
  const openCommand = useCallback(() => {
    setCommandOpen(true);
  }, []);
  useCommandShortcut(toggleCommand);

  return (
    <TooltipProvider>
      <SidebarProvider
        open={railOpen}
        onOpenChange={(next) => {
          if (!compact) {
            setRailOpen(next);
          }
        }}
      >
        <ShellNavigation
          model={model}
          compact={compact}
          railOpen={railOpen}
          navOpen={navOpen}
          onNavOpenChange={setNavOpen}
          onOpenCommandMenu={openCommand}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <ActingBanner />
          <ShellTopbar
            compact={compact}
            groupLabel={model.groupLabel}
            pageTitle={model.pageTitle}
            onOpenNavigation={() => {
              setNavOpen(true);
            }}
            onOpenSearch={openCommand}
            showApprovals
          />
          <ShellMain compact={compact} pathname={model.pathname} />
        </div>
        <CommandMenu
          open={commandOpen}
          onOpenChange={setCommandOpen}
          pages={model.pages}
          settings={model.settings}
          actions={model.actions}
          onSelect={(target) => {
            setCommandOpen(false);
            model.open(target);
          }}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}
