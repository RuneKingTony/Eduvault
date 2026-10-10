import type { Role } from '@eduvault/api-contract';
import { Badge, NavIcon } from '@eduvault/ui';
import { WithTooltip } from '../member-roles';

const SOURCE_BADGES = {
  code: {
    label: 'Built in',
    tip: 'Built into the system; can’t be edited',
  },
  starter: {
    label: 'Ready-made',
    tip: 'Inserted when the school was created; the school’s to edit',
  },
  custom: { label: 'Your own', tip: 'Created by this school' },
} as const satisfies Record<Role['source'], { label: string; tip: string }>;

function BadgeFor({ source }: { source: Role['source'] }) {
  const { label } = SOURCE_BADGES[source];
  if (source === 'code') {
    return (
      <Badge variant="outline">
        <NavIcon name="code-xml" />
        {label}
      </Badge>
    );
  }
  if (source === 'custom') {
    return (
      <Badge>
        <NavIcon name="sparkles" />
        {label}
      </Badge>
    );
  }
  return <Badge variant="secondary">{label}</Badge>;
}

export function RoleSourceBadge({ source }: { source: Role['source'] }) {
  return (
    <WithTooltip text={SOURCE_BADGES[source].tip}>
      <BadgeFor source={source} />
    </WithTooltip>
  );
}
