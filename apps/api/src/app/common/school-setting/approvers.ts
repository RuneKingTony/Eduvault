import { OWNER_ROLE, can, parsePermissionMap } from '@eduvault/policy';

interface RoleRow {
  role: string;
  label: string | null;
  permission: string;
}

export function approverLabels(rows: readonly RoleRow[]): string[] {
  const labels = rows
    .filter((row) => row.role !== OWNER_ROLE)
    .filter((row) =>
      can(parsePermissionMap(row.permission), 'adjustment', 'approve')
    )
    .map((row) => row.label ?? row.role)
    .toSorted((a, b) => a.localeCompare(b));
  return ['Owner', ...labels];
}
