import {
  handoverRoles,
  isPortalOnly,
  needsCampusStep,
  permissionsOfRoles,
  resolvePermissions,
  roleDiff,
  toPermissionMap,
  validateRoleCombo,
} from './index';

const labelOf = (slug: string) =>
  slug.slice(0, 1).toUpperCase() + slug.slice(1);

const check = (current: string[], draft: string[]) =>
  validateRoleCombo({ current, draft, memberName: 'Ada', labelOf });

describe('validateRoleCombo', () => {
  it('refuses two senior roles', () => {
    expect(check(['member'], ['member', 'administrator', 'principal'])).toBe(
      'Administrator and Principal can’t be held by the same person. Choose one senior role.'
    );
    expect(check(['member'], ['owner', 'principal'])).toBe(
      'Owner and Principal can’t be held by the same person. Choose one senior role.'
    );
  });

  it('refuses a student holding staff roles', () => {
    expect(check(['member', 'student'], ['member', 'student', 'teacher'])).toBe(
      'A student can’t also hold staff roles (Teacher).'
    );
    expect(check(['member'], ['member', 'student', 'teacher', 'bursar'])).toBe(
      'A student can’t also hold staff roles (Teacher, Bursar).'
    );
  });

  it('refuses a portal-only guardian a staff role, a school’s own included', () => {
    expect(
      check(['member', 'guardian'], ['member', 'guardian', 'teacher'])
    ).toBe(
      'Ada is a portal user (student or guardian) and can’t be given Teacher.'
    );
    expect(
      check(['member', 'guardian'], ['member', 'guardian', 'front-desk'])
    ).toBe(
      'Ada is a portal user (student or guardian) and can’t be given Front-desk.'
    );
  });

  it('checks the student rule before the portal-only rule', () => {
    expect(
      check(['member', 'student'], ['member', 'student', 'teacher'])
    ).toMatch(/^A student/);
  });

  it('lets a member-only member gain Teacher', () => {
    expect(check(['member'], ['member', 'teacher'])).toBeUndefined();
  });

  it('lets a teacher also be a guardian', () => {
    expect(
      check(['member', 'teacher'], ['member', 'teacher', 'guardian'])
    ).toBeUndefined();
  });
});

describe('isPortalOnly', () => {
  it('needs a portal role and nothing outside member, student, guardian', () => {
    expect(isPortalOnly(['member', 'guardian'])).toBe(true);
    expect(isPortalOnly(['student'])).toBe(true);
    expect(isPortalOnly(['member'])).toBe(false);
    expect(isPortalOnly([])).toBe(false);
    expect(isPortalOnly(['member', 'guardian', 'teacher'])).toBe(false);
  });
});

const permissionsOf = (roles: string[]) =>
  resolvePermissions(roles, {
    administrator: toPermissionMap(['campus:readAll', 'member:read']),
    teacher: toPermissionMap(['student:read']),
  });

describe('needsCampusStep', () => {
  it('is true without campus:readAll', () => {
    expect(needsCampusStep(permissionsOf(['member', 'teacher']))).toBe(true);
    expect(needsCampusStep(permissionsOf(['member']))).toBe(true);
  });

  it('is false when the combined permissions reach every campus', () => {
    expect(needsCampusStep(permissionsOf(['administrator', 'teacher']))).toBe(
      false
    );
    expect(needsCampusStep(permissionsOf(['owner']))).toBe(false);
  });
});

describe('permissionsOfRoles', () => {
  it('combines built-in and catalogue roles, and grants nothing for an unknown slug', () => {
    const catalogue = [
      { slug: 'front-desk', permissions: toPermissionMap(['student:read']) },
    ];
    expect(
      permissionsOfRoles(['member', 'front-desk', 'gone'], catalogue)
    ).toEqual({ student: ['read'] });
  });
});

describe('roleDiff', () => {
  it('lists added and removed roles and ignores member', () => {
    expect(roleDiff(['member', 'teacher'], ['teacher', 'bursar'])).toEqual({
      added: ['bursar'],
      removed: [],
    });
    expect(roleDiff(['teacher', 'bursar'], ['member', 'teacher'])).toEqual({
      added: [],
      removed: ['bursar'],
    });
    expect(roleDiff(['member'], ['member'])).toEqual({
      added: [],
      removed: [],
    });
  });
});

describe('handoverRoles', () => {
  it('gives the target owner in place of the senior roles', () => {
    expect(
      handoverRoles(['member', 'administrator', 'teacher'], ['member', 'owner'])
        .target
    ).toEqual(['member', 'teacher', 'owner']);
    expect(
      handoverRoles(['member', 'principal'], ['member', 'owner']).target
    ).toEqual(['member', 'owner']);
  });

  it('adds member when the target holds no roles', () => {
    expect(handoverRoles([], ['owner']).target).toEqual(['member', 'owner']);
  });

  it('takes owner from the caller and keeps the rest, or member', () => {
    expect(
      handoverRoles(['member'], ['member', 'owner', 'bursar']).caller
    ).toEqual(['member', 'bursar']);
    expect(handoverRoles(['member'], ['owner']).caller).toEqual(['member']);
  });
});
