import {
  BadgeCheckIcon,
  BanknoteIcon,
  BookMarkedIcon,
  Building2Icon,
  CalendarDaysIcon,
  CodeXmlIcon,
  GraduationCapIcon,
  HistoryIcon,
  HouseIcon,
  InboxIcon,
  KeyRoundIcon,
  LayersIcon,
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
  UserPlusIcon,
  UserRoundPlusIcon,
  UsersIcon,
  UsersRoundIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

const NAV_ICONS = {
  'layout-dashboard': LayoutDashboardIcon,
  inbox: InboxIcon,
  megaphone: MegaphoneIcon,
  'graduation-cap': GraduationCapIcon,
  users: UsersIcon,
  'users-round': UsersRoundIcon,
  'user-plus': UserPlusIcon,
  'user-round-plus': UserRoundPlusIcon,
  school: SchoolIcon,
  'book-marked': BookMarkedIcon,
  building: Building2Icon,
  'calendar-days': CalendarDaysIcon,
  wallet: WalletIcon,
  banknote: BanknoteIcon,
  'badge-check': BadgeCheckIcon,
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
  layers: LayersIcon,
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
