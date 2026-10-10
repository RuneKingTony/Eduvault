import {
  BanknoteIcon,
  BookMarkedIcon,
  Building2Icon,
  CodeXmlIcon,
  GraduationCapIcon,
  HistoryIcon,
  HouseIcon,
  InboxIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LockIcon,
  MegaphoneIcon,
  SchoolIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  StoreIcon,
  UserRoundPlusIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

const NAV_ICONS = {
  'layout-dashboard': LayoutDashboardIcon,
  inbox: InboxIcon,
  megaphone: MegaphoneIcon,
  'graduation-cap': GraduationCapIcon,
  users: UsersIcon,
  'user-round-plus': UserRoundPlusIcon,
  school: SchoolIcon,
  'book-marked': BookMarkedIcon,
  building: Building2Icon,
  wallet: WalletIcon,
  banknote: BanknoteIcon,
  store: StoreIcon,
  landmark: LandmarkIcon,
  settings: SettingsIcon,
  house: HouseIcon,
  history: HistoryIcon,
  'shield-check': ShieldCheckIcon,
  'shield-alert': ShieldAlertIcon,
  shield: ShieldIcon,
  sparkles: SparklesIcon,
  'key-round': KeyRoundIcon,
  'sliders-horizontal': SlidersHorizontalIcon,
  lock: LockIcon,
  'code-xml': CodeXmlIcon,
} as const satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

export function NavIcon({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}) {
  const Icon = NAV_ICONS[name];
  return <Icon aria-hidden className={className} />;
}
