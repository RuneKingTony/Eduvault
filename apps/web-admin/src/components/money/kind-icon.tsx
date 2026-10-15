import {
  BanknoteIcon,
  CreditCardIcon,
  GlobeIcon,
  LandmarkIcon,
  type LucideIcon,
} from 'lucide-react';
import type { MoneyAccountKind } from '@eduvault/api-contract';

const ICONS: Record<MoneyAccountKind, LucideIcon> = {
  cash: BanknoteIcon,
  bank: LandmarkIcon,
  pos: CreditCardIcon,
  gateway: GlobeIcon,
};

export function KindIcon({
  kind,
  className,
}: {
  kind: MoneyAccountKind;
  className?: string;
}) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden="true" className={className} />;
}
