import {
  ACTIONS,
  ACTION_WORDS,
  CAP_AREAS,
  PILLARS,
  PROTECTED_ROLES,
  RESERVED_ROLE_SLUGS,
  RESOURCES,
  RESOURCE_PILLARS,
  ROLE_SLUG_MAX,
  applyAreaLevel,
  capabilityLabel,
  capabilityLabels,
  capLevel,
  copyRolePermissions,
  deriveRoleSlug,
  isRoleEditable,
  isValidRoleSlug,
  missingPermissions,
  toPermissionMap,
  unknownPermissions,
  type CapArea,
  type Permission,
} from './index';

const held = (...permissions: Permission[]) => toPermissionMap(permissions);

const area = (id: string): CapArea => {
  const found = CAP_AREAS.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no area ${id}`);
  }
  return found;
};

describe('deriveRoleSlug', () => {
  it('lower-cases and turns runs of other characters into one dash', () => {
    expect(deriveRoleSlug('Fees Approver', [])).toBe('fees-approver');
    expect(deriveRoleSlug('  Head   of  Maths!! ', [])).toBe('head-of-maths');
    expect(deriveRoleSlug('Bursar (copy)', [])).toBe('bursar-copy');
    expect(deriveRoleSlug('a_b.c', [])).toBe('a-b-c');
  });

  it('falls back to role when nothing usable is left', () => {
    expect(deriveRoleSlug('', [])).toBe('role');
    expect(deriveRoleSlug('!!!', [])).toBe('role');
    expect(deriveRoleSlug('é', [])).toBe('role');
    expect(deriveRoleSlug('x', [])).toBe('role');
  });

  it('cuts to 40 characters without leaving a trailing dash', () => {
    const slug = deriveRoleSlug(`${'a'.repeat(39)} bcd`, []);
    expect(slug).toBe('a'.repeat(39));
    expect(deriveRoleSlug('b'.repeat(60), [])).toHaveLength(ROLE_SLUG_MAX);
  });

  it('adds -2, -3 on a clash', () => {
    expect(deriveRoleSlug('Cashier', ['cashier'])).toBe('cashier-2');
    expect(deriveRoleSlug('Cashier', ['cashier', 'cashier-2'])).toBe(
      'cashier-3'
    );
    expect(deriveRoleSlug('Cashier', new Set(['cashier']))).toBe('cashier-2');
  });

  it('keeps a clashing 40-character slug within 40 characters', () => {
    const base = 'c'.repeat(40);
    const second = deriveRoleSlug(base, [base]);
    expect(second).toBe(`${'c'.repeat(38)}-2`);
    expect(second).toHaveLength(ROLE_SLUG_MAX);
    expect(isValidRoleSlug(second)).toBe(true);
    const third = deriveRoleSlug(base, [base, second]);
    expect(third).toBe(`${'c'.repeat(38)}-3`);
  });

  it('never returns a reserved slug', () => {
    expect(deriveRoleSlug('Owner', [])).toBe('owner-2');
    expect(deriveRoleSlug('Member', [])).toBe('member-2');
    expect(deriveRoleSlug('Admin', [])).toBe('admin-2');
    expect(deriveRoleSlug('New', [])).toBe('new-2');
  });

  it('always derives a valid slug', () => {
    for (const label of ['Owner', '', 'Fees Approver', 'z'.repeat(80)]) {
      expect(isValidRoleSlug(deriveRoleSlug(label, []))).toBe(true);
    }
  });
});

describe('isValidRoleSlug', () => {
  it('accepts lower-case letters, digits and dashes from 2 to 40 characters', () => {
    expect(isValidRoleSlug('fees-approver')).toBe(true);
    expect(isValidRoleSlug('ab')).toBe(true);
    expect(isValidRoleSlug('a'.repeat(40))).toBe(true);
    expect(isValidRoleSlug('role-2')).toBe(true);
  });

  it('refuses the wrong length or characters', () => {
    expect(isValidRoleSlug('a')).toBe(false);
    expect(isValidRoleSlug('')).toBe(false);
    expect(isValidRoleSlug('a'.repeat(41))).toBe(false);
    expect(isValidRoleSlug('Fees')).toBe(false);
    expect(isValidRoleSlug('fees approver')).toBe(false);
    expect(isValidRoleSlug('fees_approver')).toBe(false);
  });

  it('refuses reserved names', () => {
    expect(RESERVED_ROLE_SLUGS).toEqual(['owner', 'member', 'admin', 'new']);
    for (const slug of RESERVED_ROLE_SLUGS) {
      expect(isValidRoleSlug(slug)).toBe(false);
    }
  });

  it('protects the portal roles', () => {
    expect(PROTECTED_ROLES).toEqual(['student', 'guardian']);
  });
});

describe('unknownPermissions', () => {
  it('is empty for listed permissions', () => {
    expect(unknownPermissions({ student: ['read'], ac: ['create'] })).toEqual(
      []
    );
    expect(unknownPermissions({})).toEqual([]);
  });

  it('names an action the resource does not have', () => {
    expect(
      unknownPermissions({ student: ['read', 'delete'], campus: ['create'] })
    ).toEqual(['student:delete', 'campus:create']);
  });
});

describe('missingPermissions', () => {
  it('lists what the role has and the editor lacks', () => {
    expect(
      missingPermissions(
        held('student:read', 'member:create', 'ac:read'),
        held('student:read')
      )
    ).toEqual(['member:create', 'ac:read']);
  });

  it('is empty when the editor holds everything', () => {
    expect(
      missingPermissions(held('student:read'), held('student:read', 'ac:read'))
    ).toEqual([]);
    expect(missingPermissions({}, {})).toEqual([]);
  });
});

describe('isRoleEditable', () => {
  const editor = held('ac:create', 'ac:update', 'student:read', 'team:read');
  const base = {
    slug: 'bursar',
    rolePermissions: held('student:read'),
    editorPermissions: editor,
    isNew: false,
  };

  it('is false for the built-in roles however much the editor holds', () => {
    const everything = toPermissionMap(['ac:create', 'ac:update']);
    for (const slug of ['owner', 'member']) {
      expect(
        isRoleEditable({ ...base, slug, editorPermissions: everything })
      ).toBe(false);
    }
  });

  it('needs ac:update for an existing role and ac:create for a new one', () => {
    expect(isRoleEditable(base)).toBe(true);
    expect(
      isRoleEditable({ ...base, editorPermissions: held('student:read') })
    ).toBe(false);
    expect(
      isRoleEditable({
        ...base,
        editorPermissions: held('ac:update', 'student:read'),
        isNew: true,
      })
    ).toBe(false);
    expect(
      isRoleEditable({
        ...base,
        editorPermissions: held('ac:create', 'student:read'),
        isNew: true,
      })
    ).toBe(true);
    expect(
      isRoleEditable({
        ...base,
        editorPermissions: held('ac:create', 'student:read'),
      })
    ).toBe(false);
  });

  it('is false when the role holds a permission the editor lacks', () => {
    expect(
      isRoleEditable({
        ...base,
        rolePermissions: held('student:read', 'member:create'),
      })
    ).toBe(false);
  });

  it('is true for a subset and for an empty role', () => {
    expect(
      isRoleEditable({
        ...base,
        rolePermissions: held('student:read', 'team:read'),
      })
    ).toBe(true);
    expect(isRoleEditable({ ...base, rolePermissions: {} })).toBe(true);
  });
});

describe('applyAreaLevel', () => {
  const students = area('students');
  const campuses = area('campuses');
  const everything = toPermissionMap([
    'student:read',
    'student:create',
    'student:update',
    'team:read',
    'team:create',
    'team:update',
    'team:delete',
    'campus:readAll',
  ]);

  it('sets see and change levels', () => {
    const seen = applyAreaLevel({
      map: {},
      area: students,
      level: 'see',
      editorMap: everything,
    });
    expect(seen.map).toEqual({ student: ['read'] });
    expect(seen.leftOut).toEqual([]);
    const changed = applyAreaLevel({
      map: seen.map,
      area: students,
      level: 'change',
      editorMap: everything,
    });
    expect(capLevel(changed.map, students)).toBe('change');
    expect(changed.map).toEqual({
      student: ['read', 'create', 'update'],
    });
  });

  it('replaces the area instead of adding to it', () => {
    const change = applyAreaLevel({
      map: {},
      area: students,
      level: 'change',
      editorMap: everything,
    }).map;
    expect(
      applyAreaLevel({
        map: change,
        area: students,
        level: 'see',
        editorMap: everything,
      }).map
    ).toEqual({
      student: ['read'],
    });
  });

  it('clears the area and its extras on none but leaves other areas alone', () => {
    const start = held(
      'team:read',
      'team:update',
      'campus:readAll',
      'student:read'
    );
    const cleared = applyAreaLevel({
      map: start,
      area: campuses,
      level: 'none',
      editorMap: everything,
    });
    expect(cleared.map).toEqual({ student: ['read'] });
    expect(cleared.leftOut).toEqual([]);
  });

  it('keeps extras when moving between see and change', () => {
    const start = held('team:read', 'campus:readAll');
    expect(
      applyAreaLevel({
        map: start,
        area: campuses,
        level: 'change',
        editorMap: everything,
      }).map
    ).toEqual({
      team: ['read', 'create', 'update', 'delete'],
      campus: ['readAll'],
    });
  });

  it('tidies a custom area when a level is picked', () => {
    const custom = held('student:create');
    expect(capLevel(custom, students)).toBe('custom');
    expect(
      applyAreaLevel({
        map: custom,
        area: students,
        level: 'see',
        editorMap: everything,
      }).map
    ).toEqual({
      student: ['read'],
    });
  });

  it('reports the permissions the editor could not grant and skips them', () => {
    const editor = held('student:read', 'student:create');
    const result = applyAreaLevel({
      map: {},
      area: students,
      level: 'change',
      editorMap: editor,
    });
    expect(result.map).toEqual({ student: ['read', 'create'] });
    expect(result.leftOut).toEqual(['student:update']);
  });

  it('is a no-op shape for a level the editor holds nothing of', () => {
    const result = applyAreaLevel({
      map: {},
      area: students,
      level: 'see',
      editorMap: {},
    });
    expect(result.map).toEqual({});
    expect(result.leftOut).toEqual(['student:read']);
  });
});

describe('copyRolePermissions', () => {
  it('keeps what the editor holds and lists what it skipped', () => {
    const copied = copyRolePermissions(
      held('student:read', 'member:create', 'team:read'),
      held('student:read', 'team:read')
    );
    expect(copied.kept).toEqual({ student: ['read'], team: ['read'] });
    expect(copied.skipped).toEqual(['member:create']);
  });

  it('keeps everything for an editor who holds it all', () => {
    const copied = copyRolePermissions(
      held('student:read'),
      held('student:read')
    );
    expect(copied).toEqual({ kept: { student: ['read'] }, skipped: [] });
  });

  it('copies an empty role', () => {
    expect(copyRolePermissions({}, held('student:read'))).toEqual({
      kept: {},
      skipped: [],
    });
  });
});

describe('Advanced grid vocabulary', () => {
  it('places every resource in a pillar', () => {
    for (const resource of RESOURCES) {
      expect(PILLARS).toContain(RESOURCE_PILLARS[resource]);
    }
  });

  it('words every action', () => {
    for (const action of ACTIONS) {
      expect(ACTION_WORDS[action]).not.toBe('');
    }
    expect(ACTION_WORDS.create).toBe('add');
    expect(ACTION_WORDS.readAll).toBe('see all');
  });

  it('puts the access resources under People and access', () => {
    expect(RESOURCE_PILLARS.ac).toBe('People and access');
    expect(RESOURCE_PILLARS.member).toBe('People and access');
    expect(RESOURCE_PILLARS.feeSchedule).toBe('Finance');
  });
});

describe('capabilityLabel', () => {
  it('names the area for a see or change permission and the switch for an extra', () => {
    expect(capabilityLabel('member:update')).toBe('Staff');
    expect(capabilityLabel('ac:read')).toBe('Roles');
    expect(capabilityLabel('campus:readAll')).toBe('Sees every campus');
  });

  it('falls back to the permission label for a legacy permission', () => {
    expect(capabilityLabel('feeSchedule:create')).toBe('Fee schedules: create');
  });

  it('lists each label once', () => {
    expect(
      capabilityLabels(['member:create', 'member:update', 'team:read'])
    ).toEqual(['Staff', 'Campuses']);
  });
});
