import type { ComponentProps } from 'react';
import { Badge } from '../ui/badge';

export type AnnouncementTagName = 'general' | 'academics' | 'event' | 'fees';

type Variant = NonNullable<ComponentProps<typeof Badge>['variant']>;

export const ANNOUNCEMENT_TAGS: Record<
  AnnouncementTagName,
  { label: string; variant: Variant }
> = {
  event: { label: 'Event', variant: 'default' },
  academics: { label: 'Academics', variant: 'secondary' },
  fees: { label: 'Fees', variant: 'destructive' },
  general: { label: 'General', variant: 'outline' },
};

export function AnnouncementTagBadge({
  tag,
  ...props
}: { tag: AnnouncementTagName } & Omit<
  ComponentProps<typeof Badge>,
  'variant'
>) {
  const { label, variant } = ANNOUNCEMENT_TAGS[tag];
  return (
    <Badge variant={variant} {...props}>
      {label}
    </Badge>
  );
}
