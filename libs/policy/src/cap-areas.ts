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
    id: 'staff',
    group: 'People and access',
    label: 'Staff',
    important: true,
    see: ['member:read'],
    change: ['member:create', 'member:update', 'member:delete'],
    changeDesc: 'Add and remove staff, and give them roles',
    extras: [],
  },
  {
    id: 'roles',
    group: 'People and access',
    label: 'Roles',
    important: true,
    see: ['ac:read'],
    change: ['ac:create', 'ac:update', 'ac:delete'],
    changeDesc: 'Create roles and change what they allow',
    extras: [],
  },
  {
    id: 'school-settings',
    group: 'People and access',
    label: 'School settings',
    important: false,
    see: ['schoolAccount:read'],
    change: ['schoolAccount:update'],
    changeDesc: 'Change the school profile and rules',
    extras: [
      {
        label: 'Hands over the school',
        description: 'Makes someone else the owner. Only an owner can do it.',
        permissions: ['organization:update'],
        important: true,
      },
      {
        label: 'Deletes the school',
        description:
          'Deletes a school with no students. Only an owner can do it.',
        permissions: ['organization:delete'],
        important: true,
      },
    ],
  },
  {
    id: 'school-years',
    group: 'School',
    label: 'School years and terms',
    important: false,
    see: ['session:read'],
    change: ['session:create', 'session:update', 'session:setCurrent'],
    changeDesc: 'Add school years, holidays and set the current term',
    extras: [],
  },
  {
    id: 'classes',
    group: 'School',
    label: 'Classes',
    important: false,
    see: ['class:read'],
    change: ['class:create', 'class:update', 'class:assignTeacher'],
    changeDesc:
      'Add, archive and restore classes, change levels and name class teachers',
    extras: [
      {
        label: 'Sees every class',
        description: 'Without this, they only see the classes they teach.',
        permissions: ['class:readAll'],
        important: true,
      },
    ],
  },
  {
    id: 'students',
    group: 'School',
    label: 'Students',
    important: false,
    see: ['student:read'],
    change: [
      'student:create',
      'student:update',
      'enrollment:read',
      'enrollment:create',
      'enrollment:place',
    ],
    changeDesc: 'Admit students, update them and put them in classes',
    extras: [
      {
        label: 'Records leavers and graduates',
        description: 'Takes students off the roll when they leave or graduate.',
        permissions: ['student:archive'],
        important: true,
      },
      {
        label: 'Marks students away',
        description:
          'Marks students not seen since a date, and back in school.',
        permissions: ['student:markAway'],
        important: false,
      },
    ],
  },
  {
    id: 'guardians',
    group: 'School',
    label: 'Parents and guardians',
    important: false,
    see: ['guardian:read'],
    change: ['guardian:create', 'guardian:update', 'guardian:link'],
    changeDesc: 'Add guardians and link them to students',
    extras: [],
  },
  {
    id: 'announcements',
    group: 'School',
    label: 'Announcements',
    important: false,
    see: ['announcement:read'],
    change: ['announcement:create', 'announcement:update'],
    changeDesc: 'Write, publish, pin and withdraw announcements',
    extras: [],
  },
  {
    id: 'fees',
    group: 'Money',
    label: 'Fees',
    important: false,
    see: ['feeLine:read'],
    change: ['feeLine:create', 'feeLine:update', 'feeLine:retire'],
    changeDesc: 'Set and change what each class pays',
    extras: [],
  },
  {
    id: 'money-accounts',
    group: 'Money',
    label: 'Bank and POS accounts',
    important: false,
    see: ['moneyAccount:read'],
    change: ['moneyAccount:create', 'moneyAccount:update'],
    changeDesc: 'Add and change bank and POS accounts',
    extras: [],
  },
  {
    id: 'money-categories',
    group: 'Money',
    label: 'Money categories',
    important: true,
    see: ['ledger:read'],
    change: ['ledger:manageAccounts'],
    changeDesc: 'Change the accountant’s categories',
    extras: [],
  },
  {
    id: 'portal',
    group: 'Portal',
    label: 'Own records',
    important: false,
    see: ['student:readOwn'],
    change: [],
    changeDesc: '',
    extras: [],
  },
];

export const LEGACY_PERMISSIONS: readonly Permission[] = ['feeLine:readOwn'];

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

const holdsExtra = (permissions: PermissionMap, extra: CapExtra): boolean =>
  extra.permissions.every((permission) => holds(permissions, permission));

export function capSummary(permissions: PermissionMap): string[] {
  return CAP_AREAS.flatMap((area) => {
    const lines = [areaLine(area, capLevel(permissions, area))];
    for (const extra of area.extras) {
      if (holdsExtra(permissions, extra)) {
        lines.push(extra.label);
      }
    }
    return lines.filter((line): line is string => line !== undefined);
  });
}

const LEVEL_RANK: Record<CapLevel, number> = {
  none: 0,
  custom: 1,
  see: 2,
  change: 3,
};

export interface CapChanges {
  gained: string[];
  lost: string[];
}

function levelChange(
  area: CapArea,
  before: PermissionMap,
  after: PermissionMap
): CapChanges {
  const was = capLevel(before, area);
  const now = capLevel(after, area);
  const moved = LEVEL_RANK[now] - LEVEL_RANK[was];
  const line = areaLine(area, moved > 0 ? now : was);
  return {
    gained: line !== undefined && moved > 0 ? [line] : [],
    lost: line !== undefined && moved < 0 ? [line] : [],
  };
}

function extraChanges(
  area: CapArea,
  before: PermissionMap,
  after: PermissionMap
): CapChanges {
  return {
    gained: area.extras
      .filter((extra) => holdsExtra(after, extra) && !holdsExtra(before, extra))
      .map((extra) => extra.label),
    lost: area.extras
      .filter((extra) => holdsExtra(before, extra) && !holdsExtra(after, extra))
      .map((extra) => extra.label),
  };
}

/** An area that moves up is gained at its new level; one that moves down is lost at its old level. */
export function capChanges(
  before: PermissionMap,
  after: PermissionMap
): CapChanges {
  const parts = CAP_AREAS.flatMap((area) => [
    levelChange(area, before, after),
    extraChanges(area, before, after),
  ]);
  return {
    gained: parts.flatMap((part) => part.gained),
    lost: parts.flatMap((part) => part.lost),
  };
}
