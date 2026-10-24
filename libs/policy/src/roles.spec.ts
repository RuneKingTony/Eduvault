import {
  ALL_PERMISSIONS,
  READ_PERMS,
  STARTER_ROLES,
  can,
  canAll,
  canAny,
  parsePermissionMap,
  resolvePermissions,
  splitRoles,
  splitPermission,
  toPermissionMap,
} from './index';

const starter = (slug: string) => {
  const role = STARTER_ROLES.find((candidate) => candidate.slug === slug);
  if (role === undefined) {
    throw new Error(`no starter role ${slug}`);
  }
  return toPermissionMap(role.permissions);
};

describe('roles', () => {
  it('has the six starter roles', () => {
    expect(STARTER_ROLES.map((role) => role.slug)).toEqual([
      'administrator',
      'teacher',
      'bursar',
      'principal',
      'student',
      'guardian',
    ]);
  });

  it('keeps starter and READ_PERMS sets inside the listed permissions', () => {
    for (const role of STARTER_ROLES) {
      for (const permission of role.permissions) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
    for (const permission of READ_PERMS) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
  });

  it('lets the administrator see and give roles to staff but not add or remove', () => {
    const permissions = starter('administrator');
    expect(can(permissions, 'member', 'read')).toBe(true);
    expect(can(permissions, 'member', 'update')).toBe(true);
    expect(can(permissions, 'member', 'create')).toBe(false);
    expect(can(permissions, 'member', 'delete')).toBe(false);
  });

  it('gives the administrator ac:read and no other ac permission', () => {
    const permissions = starter('administrator');
    expect(can(permissions, 'ac', 'read')).toBe(true);
    expect(permissions.ac).toEqual(['read']);
  });

  it('gives the administrator every session permission and nobody else any', () => {
    expect(starter('administrator').session).toEqual([
      'create',
      'read',
      'update',
      'setCurrent',
    ]);
    expect(
      STARTER_ROLES.filter((role) => role.slug !== 'administrator').map(
        (role) => starter(role.slug).session
      )
    ).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it('gives the administrator every class permission, the principal read and readAll and the teacher read only', () => {
    expect(starter('administrator').class).toEqual([
      'create',
      'read',
      'readAll',
      'update',
      'assignTeacher',
    ]);
    expect(starter('principal').class).toEqual(['read', 'readAll']);
    expect(starter('teacher').class).toEqual(['read']);
    expect(starter('bursar').class).toBeUndefined();
    expect(starter('student').class).toBeUndefined();
    expect(starter('guardian').class).toBeUndefined();
  });

  it('gives the administrator every enrollment and guardian permission and the bursar the two read ones', () => {
    expect(starter('administrator').enrollment).toEqual([
      'create',
      'read',
      'place',
    ]);
    expect(starter('administrator').guardian).toEqual([
      'create',
      'read',
      'update',
      'link',
    ]);
    expect(starter('bursar').guardian).toEqual(['read']);
    expect(starter('bursar').enrollment).toEqual(['read']);
    for (const slug of ['teacher', 'principal', 'student', 'guardian']) {
      expect(starter(slug).guardian).toBeUndefined();
      expect(starter(slug).enrollment).toBeUndefined();
    }
  });

  it('gives the administrator archive and markAway and the teacher markAway only', () => {
    expect(starter('administrator').student).toEqual([
      'create',
      'read',
      'update',
      'archive',
      'markAway',
    ]);
    expect(starter('teacher').student).toEqual(['read', 'markAway']);
    for (const slug of ['bursar', 'principal', 'student', 'guardian']) {
      expect(starter(slug).student ?? []).not.toContain('archive');
      expect(starter(slug).student ?? []).not.toContain('markAway');
    }
  });

  it('gives only the student and guardian roles student:readOwn', () => {
    for (const slug of ['student', 'guardian']) {
      expect(starter(slug).student).toEqual(['readOwn']);
    }
    for (const slug of ['administrator', 'teacher', 'bursar', 'principal']) {
      expect(starter(slug).student ?? []).not.toContain('readOwn');
    }
  });

  it('gives the bursar every feeLine write, the administrator feeLine:read and only the portal roles feeLine:readOwn', () => {
    expect(starter('bursar').feeLine).toEqual([
      'create',
      'read',
      'update',
      'retire',
    ]);
    expect(starter('administrator').feeLine).toEqual(['read']);
    for (const slug of ['teacher', 'principal']) {
      expect(starter(slug).feeLine).toBeUndefined();
    }
    for (const slug of ['student', 'guardian']) {
      expect(starter(slug).feeLine).toEqual(['readOwn']);
    }
  });

  it('gives the bursar invoice bill, charge and read, the administrator and principal invoice read only, and the portal roles invoice readOwn', () => {
    expect(starter('bursar').invoice).toEqual(['bill', 'charge', 'read']);
    expect(starter('administrator').invoice).toEqual(['read']);
    expect(starter('principal').invoice).toEqual(['read']);
    expect(starter('teacher').invoice).toBeUndefined();
    for (const slug of ['student', 'guardian']) {
      expect(starter(slug).invoice).toEqual(['readOwn']);
    }
  });

  it('gives the bursar every payment permission, the administrator and principal payment read, and the portal roles payment readOwn', () => {
    expect(starter('bursar').payment).toEqual(['record', 'read', 'void']);
    expect(starter('administrator').payment).toEqual(['read']);
    expect(starter('principal').payment).toEqual(['read']);
    expect(starter('teacher').payment).toBeUndefined();
    for (const slug of ['student', 'guardian']) {
      expect(starter(slug).payment).toEqual(['readOwn']);
    }
  });

  it('gives the student and guardian roles all four own-record permissions and nobody else any', () => {
    const own = [
      'student:readOwn',
      'invoice:readOwn',
      'feeLine:readOwn',
      'payment:readOwn',
    ];
    for (const slug of ['student', 'guardian']) {
      const role = STARTER_ROLES.find((candidate) => candidate.slug === slug);
      expect(role?.permissions).toEqual(expect.arrayContaining(own));
    }
    for (const slug of ['administrator', 'teacher', 'bursar', 'principal']) {
      const role = STARTER_ROLES.find((candidate) => candidate.slug === slug);
      for (const permission of own) {
        expect(role?.permissions).not.toContain(permission);
      }
    }
  });

  it('gives only the principal leave approval', () => {
    expect(starter('principal').leave).toEqual(['approve']);
    const others = STARTER_ROLES.filter((role) => role.slug !== 'principal');
    for (const other of others) {
      expect(toPermissionMap(other.permissions).leave).toBeUndefined();
    }
  });

  it('gives the bursar adjustment read and create, the principal read and approve, and nobody else any', () => {
    expect(starter('bursar').adjustment).toEqual(['read', 'create']);
    expect(starter('principal').adjustment).toEqual(['read', 'approve']);
    for (const slug of ['administrator', 'teacher', 'student', 'guardian']) {
      expect(starter(slug).adjustment).toBeUndefined();
    }
  });

  it('counts invoice:read but not invoice:bill in READ_PERMS', () => {
    expect(READ_PERMS).toContain('invoice:read');
    expect(READ_PERMS).not.toContain('invoice:bill');
    expect(READ_PERMS).not.toContain('invoice:charge');
  });

  it('gives the administrator and principal every announcement permission and nobody else any', () => {
    for (const slug of ['administrator', 'principal']) {
      expect(starter(slug).announcement).toEqual(['create', 'read', 'update']);
    }
    for (const slug of ['teacher', 'bursar', 'student', 'guardian']) {
      expect(starter(slug).announcement).toBeUndefined();
    }
  });

  it('counts the new read permissions in READ_PERMS', () => {
    expect(READ_PERMS).toEqual(
      expect.arrayContaining(['enrollment:read', 'guardian:read'])
    );
  });

  it('gives the bursar money account and ledger reads, the principal money accounts, and nobody else any', () => {
    expect(starter('bursar').moneyAccount).toEqual(['read']);
    expect(starter('bursar').ledger).toEqual(['read']);
    expect(starter('principal').moneyAccount).toEqual(['read']);
    expect(starter('principal').ledger).toBeUndefined();
    for (const slug of ['administrator', 'teacher', 'student', 'guardian']) {
      expect(starter(slug).moneyAccount).toBeUndefined();
      expect(starter(slug).ledger).toBeUndefined();
    }
  });

  it('gives the bursar store read, receive, issue and count, the administrator and principal store read, and nobody else any', () => {
    expect(starter('bursar').store).toEqual([
      'read',
      'receive',
      'issue',
      'count',
    ]);
    expect(starter('administrator').store).toEqual(['read']);
    expect(starter('principal').store).toEqual(['read']);
    for (const slug of ['teacher', 'student', 'guardian']) {
      expect(starter(slug).store).toBeUndefined();
    }
    expect(READ_PERMS).toContain('store:read');
    expect(READ_PERMS).not.toContain('store:receive');
    expect(READ_PERMS).not.toContain('store:issue');
    expect(READ_PERMS).not.toContain('store:count');
  });

  it('grants wallet permissions by least privilege and keeps the gateway owner-only', () => {
    expect(starter('bursar').wallet).toEqual([
      'read',
      'topUp',
      'requestRefund',
    ]);
    expect(starter('principal').wallet).toEqual(['read', 'approveRefund']);
    expect(starter('administrator').wallet).toEqual(['read']);
    expect(starter('guardian').wallet).toEqual(['readOwn', 'spend']);
    for (const slug of ['teacher', 'student']) {
      expect(starter(slug).wallet).toBeUndefined();
    }
    for (const role of STARTER_ROLES) {
      expect(role.permissions).not.toContain('wallet:manageGateway');
    }
    expect(READ_PERMS).toContain('wallet:read');
    expect(READ_PERMS).not.toContain('wallet:readOwn');
  });

  it('keeps ledger:manageAccounts and the money account writes out of every starter role', () => {
    for (const role of STARTER_ROLES) {
      for (const permission of [
        'ledger:manageAccounts',
        'moneyAccount:create',
        'moneyAccount:update',
      ] as const) {
        expect(role.permissions).not.toContain(permission);
      }
    }
  });

  it('gives the administrator every subject permission, the principal and teacher subject:read, and the rest none', () => {
    expect(starter('administrator').subject).toEqual([
      'create',
      'read',
      'update',
    ]);
    expect(starter('principal').subject).toEqual(['read']);
    expect(starter('teacher').subject).toEqual(['read']);
    for (const slug of ['bursar', 'student', 'guardian']) {
      expect(starter(slug).subject).toBeUndefined();
    }
  });

  it('gates the subject routes on subject permissions and assigning on class:assignTeacher', () => {
    const administrator = starter('administrator');
    expect(can(administrator, 'subject', 'create')).toBe(true);
    expect(can(administrator, 'class', 'assignTeacher')).toBe(true);
    const teacher = starter('teacher');
    expect(can(teacher, 'subject', 'read')).toBe(true);
    expect(can(teacher, 'subject', 'create')).toBe(false);
    expect(can(teacher, 'subject', 'update')).toBe(false);
    expect(can(teacher, 'class', 'assignTeacher')).toBe(false);
    expect(can(starter('principal'), 'class', 'assignTeacher')).toBe(false);
    expect(can(starter('bursar'), 'subject', 'read')).toBe(false);
  });

  it('counts subject:read in READ_PERMS and leaves the writes out', () => {
    expect(READ_PERMS).toContain('subject:read');
    expect(READ_PERMS).not.toContain('subject:create');
    expect(READ_PERMS).not.toContain('subject:update');
  });

  it('counts the money reads in READ_PERMS', () => {
    expect(READ_PERMS).toEqual(
      expect.arrayContaining(['ledger:read', 'moneyAccount:read'])
    );
    expect(READ_PERMS).not.toContain('ledger:manageAccounts');
  });

  it('keeps ac:create, ac:update and ac:delete out of every starter role', () => {
    for (const role of STARTER_ROLES) {
      for (const action of ['ac:create', 'ac:update', 'ac:delete'] as const) {
        expect(role.permissions).not.toContain(action);
      }
    }
  });

  it('has no readOwn in READ_PERMS', () => {
    expect(
      READ_PERMS.filter((permission) => permission.endsWith(':readOwn'))
    ).toEqual([]);
  });

  it('resolves owner to every permission with no custom rows', () => {
    const permissions = resolvePermissions(['owner'], {});
    for (const permission of ALL_PERMISSIONS) {
      const [resource, action] = splitPermission(permission);
      expect(permissions[resource]).toContain(action);
    }
  });

  it('gives the administrator schoolAccount:read, campus management and reach, and the principal team:read', () => {
    const administrator = starter('administrator');
    expect(administrator.schoolAccount).toEqual(['read']);
    expect(administrator.team).toEqual(['read', 'create', 'update']);
    expect(administrator.campus).toEqual(['readAll']);
    expect(starter('principal').team).toEqual(['read']);
  });

  it('parses a stored role that still carries the dropped schoolAccount create and delete', () => {
    expect(
      parsePermissionMap(
        '{"schoolAccount":["read","create","update","delete"],"student":["read"]}'
      )
    ).toEqual({ schoolAccount: ['read', 'update'], student: ['read'] });
  });

  it('gives the owner every ac permission', () => {
    expect(resolvePermissions(['owner'], {}).ac).toEqual([
      'create',
      'read',
      'update',
      'delete',
    ]);
  });

  it('resolves member to nothing', () => {
    expect(resolvePermissions(['member'], {})).toEqual({});
  });

  it('ignores a role with no row', () => {
    expect(resolvePermissions(['ghost', 'constructor'], {})).toEqual({});
  });

  it('unions two roles', () => {
    const permissions = resolvePermissions(['teacher', 'principal'], {
      teacher: starter('teacher'),
      principal: starter('principal'),
    });
    expect(permissions).toEqual({
      student: ['read', 'markAway'],
      class: ['read', 'readAll'],
      subject: ['read'],
      team: ['read'],
      campus: ['readAll'],
      announcement: ['create', 'read', 'update'],
      invoice: ['read'],
      payment: ['read'],
      adjustment: ['read', 'approve'],
      leave: ['approve'],
      moneyAccount: ['read'],
      store: ['read'],
      wallet: ['read', 'approveRefund'],
    });
  });

  it('checks one permission with can', () => {
    const permissions = starter('bursar');
    expect(can(permissions, 'student', 'read')).toBe(true);
    expect(can(permissions, 'student', 'create')).toBe(false);
    expect(can(permissions, 'team', 'read')).toBe(false);
  });

  it('passes canAny with one of several', () => {
    const permissions = starter('bursar');
    expect(canAny(permissions, ['team:read', 'student:read'])).toBe(true);
    expect(canAny(permissions, ['team:read', 'schoolAccount:read'])).toBe(
      false
    );
    expect(canAny(permissions, [])).toBe(false);
  });

  it('passes canAll only with every permission', () => {
    const permissions = starter('bursar');
    expect(canAll(permissions, ['feeLine:read', 'student:read'])).toBe(true);
    expect(canAll(permissions, ['student:read', 'schoolAccount:read'])).toBe(
      false
    );
    expect(canAll(permissions, [])).toBe(true);
  });

  it('parses a stored permission column and drops unknown entries', () => {
    expect(
      parsePermissionMap(
        '{"student":["read","delete"],"ghost":["read"],"team":"read"}'
      )
    ).toEqual({ student: ['read'] });
    expect(parsePermissionMap('not json')).toEqual({});
    expect(parsePermissionMap('[]')).toEqual({});
    expect(parsePermissionMap('null')).toEqual({});
  });

  it('splits a comma-joined role string and ignores blanks', () => {
    expect(splitRoles('teacher, principal,,')).toEqual([
      'teacher',
      'principal',
    ]);
    expect(splitRoles('')).toEqual([]);
    expect(splitRoles(null)).toEqual([]);
    expect(splitRoles(undefined)).toEqual([]);
  });
});
