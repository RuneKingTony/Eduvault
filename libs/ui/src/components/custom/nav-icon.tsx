import {
  BanknoteIcon,
  BookMarkedIcon,
  GraduationCapIcon,
  HistoryIcon,
  HouseIcon,
  InboxIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MegaphoneIcon,
  SchoolIcon,
  SettingsIcon,
  StoreIcon,
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
  school: SchoolIcon,
  'book-marked': BookMarkedIcon,
  wallet: WalletIcon,
  banknote: BanknoteIcon,
  store: StoreIcon,
  landmark: LandmarkIcon,
  settings: SettingsIcon,
  house: HouseIcon,
  history: HistoryIcon,
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
