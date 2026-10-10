import type { MemberDetail, SchoolRole } from '@eduvault/api-contract';
import {
  capChanges,
  needsCampusStep,
  permissionsOfRoles,
  roleDiff,
  toPermissions,
  validateRoleCombo,
  type RoleDiff,
  withMemberRole,
} from '@eduvault/policy';
import { roleLabelOf } from './member-roles';

export type WizardStep = 'roles' | 'campuses' | 'review';

export interface WizardModel {
  draft: string[];
  diff: RoleDiff;
  changed: boolean;
  needsCampus: boolean;
  combo: string | undefined;
  steps: WizardStep[];
  more: number;
  fewer: number;
  gained: string[];
  lost: string[];
}

export function buildWizardModel({
  member,
  catalogue,
  draftRoles,
}: {
  member: MemberDetail;
  catalogue: readonly SchoolRole[];
  draftRoles: readonly string[];
}): WizardModel {
  const draft = withMemberRole(draftRoles);
  const diff = roleDiff(member.roles, draft);
  const before = permissionsOfRoles(member.roles, catalogue);
  const after = permissionsOfRoles(draft, catalogue);
  const had = new Set(toPermissions(before));
  const has = new Set(toPermissions(after));
  const needsCampus = needsCampusStep(after);
  const { gained, lost } = capChanges(before, after);
  return {
    draft,
    diff,
    changed: diff.added.length + diff.removed.length > 0,
    needsCampus,
    combo: validateRoleCombo({
      current: member.roles,
      draft,
      memberName: member.name,
      labelOf: (slug) => roleLabelOf(catalogue, slug),
    }),
    steps: needsCampus ? ['roles', 'campuses', 'review'] : ['roles', 'review'],
    more: [...has].filter((permission) => !had.has(permission)).length,
    fewer: [...had].filter((permission) => !has.has(permission)).length,
    gained,
    lost,
  };
}

export function changeSummary({ more, fewer }: WizardModel): string {
  if (more === 0 && fewer === 0) {
    return 'No change to what they can do';
  }
  return `${more} more, ${fewer} fewer things they can do`;
}
