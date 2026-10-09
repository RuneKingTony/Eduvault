import {
  ALL_PERMISSIONS,
  CAP_AREAS,
  LEGACY_PERMISSIONS,
  OWNER_ROLE,
  STARTER_ROLES,
  capLevel,
  capSummary,
  resolvePermissions,
  toPermissionMap,
  type CapArea,
} from './index';

const area = (id: string): CapArea => {
  const found = CAP_AREAS.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no area ${id}`);
  }
  return found;
};

const summaryFor = (slug: string) => {
  const role = STARTER_ROLES.find((candidate) => candidate.slug === slug);
  return capSummary(toPermissionMap(role?.permissions ?? []));
};

describe('CAP_AREAS', () => {
  const slots = CAP_AREAS.flatMap((candidate) => [
    ...candidate.see,
    ...candidate.change,
    ...candidate.extras.flatMap((extra) => extra.permissions),
  ]);

  it('places every permission in exactly one slot or lists it as legacy', () => {
    for (const permission of ALL_PERMISSIONS) {
      const count = slots.filter((slot) => slot === permission).length;
      const legacy = LEGACY_PERMISSIONS.includes(permission);
      expect(legacy ? count : count - 1).toBe(0);
    }
  });

  it('names only listed permissions', () => {
    for (const slot of slots) {
      expect(ALL_PERMISSIONS).toContain(slot);
    }
    for (const permission of LEGACY_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
  });
});

describe('capLevel', () => {
  const campuses = area('campuses');

  it('is change when every see and change permission is held', () => {
    const permissions = toPermissionMap([...campuses.see, ...campuses.change]);
    expect(capLevel(permissions, campuses)).toBe('change');
  });

  it('is see when only the see set is held', () => {
    expect(capLevel(toPermissionMap(['team:read']), campuses)).toBe('see');
  });

  it('is custom when only part of the sets is held', () => {
    expect(capLevel(toPermissionMap(['team:update']), campuses)).toBe('custom');
  });

  it('is none when nothing is held', () => {
    expect(capLevel({}, campuses)).toBe('none');
    expect(capLevel(toPermissionMap(['campus:readAll']), campuses)).toBe(
      'none'
    );
  });
});

describe('capSummary', () => {
  it('describes the owner by what they can change', () => {
    expect(capSummary(resolvePermissions([OWNER_ROLE], {}))).toEqual([
      'Campuses: add and rename campuses',
      'Sees every campus',
      'School settings: change the school profile and rules',
      'Students: admit students, update them and put them in classes',
    ]);
  });

  it('describes the administrator', () => {
    expect(summaryFor('administrator')).toEqual([
      'Campuses: can see',
      'Sees every campus',
      'School settings: can see',
      'Students: admit students, update them and put them in classes',
    ]);
  });

  it('describes the teacher and bursar', () => {
    expect(summaryFor('teacher')).toEqual(['Students: can see']);
    expect(summaryFor('bursar')).toEqual(['Students: can see']);
  });

  it('describes the principal', () => {
    expect(summaryFor('principal')).toEqual([
      'Campuses: can see',
      'Sees every campus',
      'Students: can see',
    ]);
  });

  it('is empty for a member', () => {
    expect(capSummary(resolvePermissions(['member'], {}))).toEqual([]);
  });
});
