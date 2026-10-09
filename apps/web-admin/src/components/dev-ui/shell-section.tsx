import {
  AppTopbar,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Kbd,
  NavIcon,
  PortalBottomNav,
  PortalNav,
  PortalTopbar,
  SchoolCrest,
  Skeleton,
  avatarHueClass,
  cn,
  type PortalNavItem,
  type RenderPortalNavLink,
} from '@eduvault/ui';

const PORTAL_ITEMS: PortalNavItem[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/',
    icon: <NavIcon name="house" />,
    current: true,
  },
  {
    id: 'fees',
    label: 'Fees',
    href: '/fees',
    icon: <NavIcon name="wallet" />,
    current: false,
  },
];

const renderLink: RenderPortalNavLink = ({ item, className, children }) => (
  <a
    href={item.href}
    className={className}
    aria-current={item.current ? 'page' : undefined}
  >
    {children}
  </a>
);

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const NAMES = [
  'Funmi Adeyemi',
  'Tunde Bakare',
  'Chika Eze',
  'Emeka Obi',
  'Grace Eke',
  'Kemi Lawson',
];

function Frame({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3>{title}</h3>
      <div className={cn('rounded-lg border bg-card p-3', className)}>
        {children}
      </div>
    </div>
  );
}

function PortalPieces() {
  return (
    <>
      <Frame title="Portal topbar and nav">
        <PortalTopbar schoolName="Greenfield College" schoolInitials="GC">
          <Badge variant="secondary">Account</Badge>
        </PortalTopbar>
        <PortalNav items={PORTAL_ITEMS} renderLink={renderLink} />
      </Frame>
      <Frame
        title="Portal bottom nav"
        className="relative h-24 transform-gpu overflow-hidden p-0"
      >
        <PortalBottomNav items={PORTAL_ITEMS} renderLink={renderLink} />
      </Frame>
    </>
  );
}

function Primitives() {
  return (
    <Frame
      title="Skeleton, empty state and buttons"
      className="flex flex-col gap-3"
    >
      <Skeleton className="h-6 w-1/2" />
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>
            Rows show up here once there are some.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <div className="flex flex-wrap gap-2">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
      </div>
    </Frame>
  );
}

export function ShellSection() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Frame title="School crest" className="flex items-center gap-3">
        <SchoolCrest name="Greenfield College" initials="GC" />
        <SchoolCrest name="Greenfield College" initials="GC" logoUrl={PIXEL} />
      </Frame>
      <Frame
        title="Avatars (hue from the name)"
        className="flex flex-wrap gap-2"
      >
        {NAMES.map((name) => (
          <Avatar key={name}>
            <AvatarFallback className={avatarHueClass(name)}>
              {name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        ))}
      </Frame>
      <Frame title="Topbar">
        <AppTopbar
          start={
            <Button variant="ghost" size="icon-sm" aria-label="Rail toggle">
              ▤
            </Button>
          }
          end={
            <Button variant="outline" size="sm">
              Search… <Kbd>⌘K</Kbd>
            </Button>
          }
        >
          <span className="text-sm">Finance › Fees</span>
        </AppTopbar>
      </Frame>
      <PortalPieces />
      <Primitives />
    </div>
  );
}
