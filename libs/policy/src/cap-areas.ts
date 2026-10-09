import { holds } from './roles';
import type { Permission, PermissionMap } from './statements';

export interface CapExtra {
  label: string;
  description: string;
  permissions: readonly Permission[];
  important: boolean;
}

export interface CapArea {
  id: string;
  group: string;
  label: string;
  important: boolean;
  see: readonly Permission[];
  change: readonly Permission[];
  changeDesc: string;
  extras: readonly CapExtra[];
}

export type CapLevel = 'change' | 'see' | 'custom' | 'none';

export const CAP_AREAS: readonly CapArea[] = [
  {
    id: 'campuses',
    group: 'People and access',
    label: 'Campuses',
    important: false,
    see: ['team:read'],
    change: ['team:create', 'team:update', 'team:delete'],
    changeDesc: 'Add and rename campuses',
    extras: [
      {
        label: 'Sees every campus',
        description: 'Without this, they only see the campuses they work on.',
        permissions: ['campus:readAll'],
        important: true,
      },
    ],
  },
  {
    id: 'school-settings',
    group: 'People and access',
    label: 'School settings',
    important: false,
    see: ['schoolAccount:read'],
    change: ['schoolAccount:update'],
    changeDesc: 'Change the school profile and rules',
    extras: [],
  },
  {
    id: 'students',
    group: 'School',
    label: 'Students',
    important: false,
    see: ['student:read'],
    change: ['student:create', 'student:update'],
    changeDesc: 'Admit students, update them and put them in classes',
    extras: [],
  },
];

export const LEGACY_PERMISSIONS: readonly Permission[] = [
  'feeSchedule:create',
  'feeSchedule:read',
  'feeSchedule:update',
  'feeSchedule:delete',
  'schoolAccount:create',
  'schoolAccount:delete',
];

export function capLevel(permissions: PermissionMap, area: CapArea): CapLevel {
  const every = (list: readonly Permission[]) =>
    list.every((permission) => holds(permissions, permission));
  if (area.change.length > 0 && every(area.see) && every(area.change)) {
    return 'change';
  }
  if (every(area.see)) {
    return 'see';
  }
  const any = [...area.see, ...area.change].some((permission) =>
    holds(permissions, permission)
  );
  return any ? 'custom' : 'none';
}

const lowerFirst = (text: string) =>
  `${text.slice(0, 1).toLowerCase()}${text.slice(1)}`;

function areaLine(area: CapArea, level: CapLevel): string | undefined {
  switch (level) {
    case 'change': {
      return `${area.label}: ${lowerFirst(area.changeDesc)}`;
    }
    case 'see': {
      return `${area.label}: can see`;
    }
    case 'custom': {
      return `${area.label}: some access`;
    }
    case 'none': {
      return undefined;
    }
  }
}

export function capSummary(permissions: PermissionMap): string[] {
  return CAP_AREAS.flatMap((area) => {
    const lines = [areaLine(area, capLevel(permissions, area))];
    for (const extra of area.extras) {
      if (
        extra.permissions.every((permission) => holds(permissions, permission))
      ) {
        lines.push(extra.label);
      }
    }
    return lines.filter((line): line is string => line !== undefined);
  });
}
