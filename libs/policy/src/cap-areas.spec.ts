import {
  ALL_PERMISSIONS,
  CAP_AREAS,
  LEGACY_PERMISSIONS,
  OWNER_ROLE,
  STARTER_ROLES,
  capChanges,
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

describe('the Roles area', () => {
  const roles = area('roles');

  it('sits in People and access after Staff and is important', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('roles')).toBe(ids.indexOf('staff') + 1);
    expect(roles.group).toBe('People and access');
    expect(roles.important).toBe(true);
    expect(roles.see).toEqual(['ac:read']);
    expect(roles.change).toEqual(['ac:create', 'ac:update', 'ac:delete']);
    expect(roles.changeDesc).toBe('Create roles and change what they allow');
  });

  it('is see for ac:read alone and custom for a lone ac:update', () => {
    expect(capLevel(toPermissionMap(['ac:read']), roles)).toBe('see');
    expect(capLevel(toPermissionMap(['ac:update']), roles)).toBe('custom');
  });
});

describe('the School years and terms area', () => {
  const years = area('school-years');

  it('sits in School before Classes and splits seeing from changing', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('school-years')).toBe(ids.indexOf('classes') - 1);
    expect(years.group).toBe('School');
    expect(years.label).toBe('School years and terms');
    expect(years.see).toEqual(['session:read']);
    expect(years.change).toEqual([
      'session:create',
      'session:update',
      'session:setCurrent',
    ]);
    expect(years.changeDesc).toBe(
      'Add school years, holidays and set the current term'
    );
  });

  it('is change for all four, see for session:read and custom for a lone update', () => {
    expect(
      capLevel(toPermissionMap([...years.see, ...years.change]), years)
    ).toBe('change');
    expect(capLevel(toPermissionMap(['session:read']), years)).toBe('see');
    expect(capLevel(toPermissionMap(['session:update']), years)).toBe('custom');
  });
});

describe('the Classes area', () => {
  const classes = area('classes');

  it('sits in School before Students and splits seeing from changing', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('classes')).toBe(ids.indexOf('students') - 1);
    expect(classes.group).toBe('School');
    expect(classes.label).toBe('Classes');
    expect(classes.see).toEqual(['class:read']);
    expect(classes.change).toEqual([
      'class:create',
      'class:update',
      'class:assignTeacher',
    ]);
    expect(classes.changeDesc).toBe(
      'Add, archive and restore classes, change levels and name class teachers'
    );
  });

  it('offers Sees every class as an important extra', () => {
    expect(classes.extras).toEqual([
      expect.objectContaining({
        label: 'Sees every class',
        permissions: ['class:readAll'],
        important: true,
      }),
    ]);
  });

  it('is change for all four, see for class:read and custom for a lone update', () => {
    expect(
      capLevel(toPermissionMap([...classes.see, ...classes.change]), classes)
    ).toBe('change');
    expect(capLevel(toPermissionMap(['class:read']), classes)).toBe('see');
    expect(capLevel(toPermissionMap(['class:update']), classes)).toBe('custom');
  });
});

describe('the Students and Parents and guardians areas', () => {
  const students = area('students');
  const guardians = area('guardians');

  it('puts enrolment permissions in Students and the four guardian ones in Parents and guardians', () => {
    expect(students.change).toEqual([
      'student:create',
      'student:update',
      'enrollment:read',
      'enrollment:create',
      'enrollment:place',
    ]);
    expect(guardians.group).toBe('School');
    expect(guardians.label).toBe('Parents and guardians');
    expect(guardians.see).toEqual(['guardian:read']);
    expect(guardians.change).toEqual([
      'guardian:create',
      'guardian:update',
      'guardian:link',
    ]);
    expect(guardians.changeDesc).toBe(
      'Add guardians and link them to students'
    );
  });

  it('lists the lifecycle permissions as Students extras', () => {
    expect(students.extras).toEqual([
      expect.objectContaining({
        label: 'Records leavers and graduates',
        permissions: ['student:archive'],
      }),
      expect.objectContaining({
        label: 'Marks students away',
        permissions: ['student:markAway'],
      }),
    ]);
  });

  it('sits after Students', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('guardians')).toBe(ids.indexOf('students') + 1);
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
      'Staff: add and remove staff, and give them roles',
      'Roles: create roles and change what they allow',
      'School settings: change the school profile and rules',
      'Hands over the school',
      'Deletes the school',
      'School years and terms: add school years, holidays and set the current term',
      'Classes: add, archive and restore classes, change levels and name class teachers',
      'Sees every class',
      'Students: admit students, update them and put them in classes',
      'Records leavers and graduates',
      'Marks students away',
      'Parents and guardians: add guardians and link them to students',
    ]);
  });

  it('describes the administrator', () => {
    expect(summaryFor('administrator')).toEqual([
      'Campuses: can see',
      'Sees every campus',
      'Staff: can see',
      'Roles: can see',
      'School settings: can see',
      'School years and terms: add school years, holidays and set the current term',
      'Classes: add, archive and restore classes, change levels and name class teachers',
      'Sees every class',
      'Students: admit students, update them and put them in classes',
      'Records leavers and graduates',
      'Marks students away',
      'Parents and guardians: add guardians and link them to students',
    ]);
  });

  it('describes the teacher and bursar', () => {
    expect(summaryFor('teacher')).toEqual([
      'Classes: can see',
      'Students: can see',
      'Marks students away',
    ]);
    expect(summaryFor('bursar')).toEqual([
      'Students: can see',
      'Parents and guardians: can see',
    ]);
  });

  it('describes the principal', () => {
    expect(summaryFor('principal')).toEqual([
      'Campuses: can see',
      'Sees every campus',
      'Classes: can see',
      'Sees every class',
      'Students: can see',
    ]);
  });

  it('is empty for a member', () => {
    expect(capSummary(resolvePermissions(['member'], {}))).toEqual([]);
  });
});

const held = (...permissions: Parameters<typeof toPermissionMap>[0]) =>
  toPermissionMap(permissions);

describe('capChanges', () => {
  it('is empty when nothing moves', () => {
    expect(capChanges(held('student:read'), held('student:read'))).toEqual({
      gained: [],
      lost: [],
    });
  });

  it('gains a new area and an extra', () => {
    expect(capChanges(held(), held('student:read', 'campus:readAll'))).toEqual({
      gained: ['Sees every campus', 'Students: can see'],
      lost: [],
    });
  });

  it('counts a higher level as gained and a lower one as lost, never both', () => {
    const see = held('student:read');
    const change = held(
      ...CAP_AREAS.flatMap((candidate) =>
        candidate.id === 'students'
          ? [...candidate.see, ...candidate.change]
          : []
      )
    );
    const changeLine =
      'Students: admit students, update them and put them in classes';
    expect(capChanges(see, change)).toEqual({ gained: [changeLine], lost: [] });
    expect(capChanges(change, see)).toEqual({ gained: [], lost: [changeLine] });
  });
});
