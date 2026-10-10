import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_ROLES_PER_SCHOOL,
  toPermissionMap,
  type Permission,
  type PermissionMap,
} from '@eduvault/policy';
import type { RoleAdminService, OrgContext } from '../../common/auth';
import {
  RolesRepository,
  type RoleMemberRecord,
  type RoleRecord,
} from './roles.repository';
import { RolesService } from './roles.service';

const ORG = 'school-a';

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));

const row = (
  slug: string,
  overrides: Partial<RoleRecord> = {}
): RoleRecord => ({
  slug,
  label: slug.charAt(0).toUpperCase() + slug.slice(1),
  description: null,
  source: 'starter',
  permissions: {},
  createdAt: at(0),
  ...overrides,
});

const member = (
  id: string,
  roles: string[],
  campusIds: string[] = []
): RoleMemberRecord => ({
  memberId: id,
  name: `Name ${id}`,
  roles: ['member', ...roles],
  campusIds,
});

const baseRows = (): RoleRecord[] => [
  row('principal', { permissions: toPermissionMap(['student:read']) }),
  row('teacher', { permissions: toPermissionMap(['student:read']) }),
  row('administrator', {
    permissions: toPermissionMap(['student:read', 'member:read', 'ac:read']),
  }),
  row('student'),
  row('guardian'),
  row('bursar', { permissions: toPermissionMap(['student:read']) }),
  row('later', { source: 'custom', createdAt: at(30) }),
  row('earlier', { source: 'custom', createdAt: at(10) }),
];

class FakeRoles extends RolesRepository {
  constructor(
    public rows: RoleRecord[],
    public members: RoleMemberRecord[] = []
  ) {
    super();
  }

  listRoles() {
    return Promise.resolve(this.rows);
  }

  listMembers() {
    return Promise.resolve(this.members);
  }
}

const OWNER_PERMISSIONS = toPermissionMap([
  'ac:create',
  'ac:read',
  'ac:update',
  'ac:delete',
  'member:read',
  'student:read',
  'student:create',
  'team:read',
]);

const context = (
  permissions: PermissionMap = OWNER_PERMISSIONS
): OrgContext => ({
  user: { id: 'user-caller', email: 'caller@example.com', name: 'Caller' },
  organizationId: ORG,
  roles: ['custom'],
  permissions,
  isOwner: false,
  activeCampusId: null,
  campusScope: 'all',
  classScope: 'all',
  acting: null,
  headers: new Headers(),
});

const withHeld = (...permissions: Permission[]) =>
  context(toPermissionMap(permissions));

const onCampuses = (campusIds: string[]): OrgContext => ({
  ...context(),
  campusScope: campusIds,
});

const setup = (
  rows: RoleRecord[] = baseRows(),
  members: RoleMemberRecord[] = []
) => {
  const repository = new FakeRoles(rows, members);
  const admin = {
    underSchoolLock: vi.fn((_: string, fn: () => Promise<unknown>) => fn()),
    create: vi.fn(
      (input: {
        slug: string;
        label: string;
        permissions: PermissionMap;
        description: string | null;
      }) => {
        repository.rows.push(
          row(input.slug, {
            source: 'custom',
            label: input.label,
            description: input.description,
            permissions: input.permissions,
            createdAt: at(50),
          })
        );
        return Promise.resolve();
      }
    ),
    update: vi.fn(
      (
        key: { slug: string },
        changes: {
          label?: string;
          description?: string | null;
          permissions?: PermissionMap;
        }
      ) => {
        repository.rows = repository.rows.map((existing) =>
          existing.slug === key.slug
            ? {
                ...existing,
                ...(changes.label === undefined
                  ? {}
                  : { label: changes.label }),
                ...(changes.description === undefined
                  ? {}
                  : { description: changes.description }),
                ...(changes.permissions === undefined
                  ? {}
                  : { permissions: changes.permissions }),
              }
            : existing
        );
        return Promise.resolve();
      }
    ),
    remove: vi.fn((key: { slug: string }) => {
      repository.rows = repository.rows.filter(
        (existing) => existing.slug !== key.slug
      );
      return Promise.resolve();
    }),
  };
  const service = new RolesService(
    repository,
    admin as unknown as RoleAdminService
  );
  const writes = () => [admin.create, admin.update, admin.remove];
  return { service, admin, repository, writes };
};

const rejection = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => 'resolved',
    (error: unknown) => error
  );

const responseOf = (error: unknown): Record<string, unknown> =>
  (error as { getResponse: () => Record<string, unknown> }).getResponse();

const noWrites = (writes: ReturnType<typeof setup>['writes']) => {
  for (const write of writes()) {
    expect(write).not.toHaveBeenCalled();
  }
};

describe('RolesService reads', () => {
  it('lists Owner and Member first, then ready-made roles in seed order, then own roles by creation', async () => {
    const { service } = setup();
    const { items } = await service.list(context());
    expect(items.map((item) => item.slug)).toEqual([
      'owner',
      'member',
      'administrator',
      'teacher',
      'bursar',
      'principal',
      'student',
      'guardian',
      'earlier',
      'later',
    ]);
    expect(items.map((item) => item.source)).toEqual([
      'code',
      'code',
      'starter',
      'starter',
      'starter',
      'starter',
      'starter',
      'starter',
      'custom',
      'custom',
    ]);
  });

  it('gives Owner every permission and Member none', async () => {
    const { service } = setup();
    const { items } = await service.list(context());
    expect(items[0]?.permissions.ac).toEqual([
      'create',
      'read',
      'update',
      'delete',
    ]);
    expect(items[0]?.label).toBe('Owner');
    expect(items[1]?.permissions).toEqual({});
    expect(items[1]?.label).toBe('Member');
  });

  it('counts holders always and names them only with member:read', async () => {
    const members = [
      member('m1', ['owner']),
      member('m2', ['bursar']),
      member('m3', ['bursar', 'teacher']),
    ];
    const { service } = setup(baseRows(), members);

    const named = await service.get(context(), 'bursar');
    expect(named.holderCount).toBe(2);
    expect(named.holders).toEqual([
      { memberId: 'm2', name: 'Name m2', roles: ['member', 'bursar'] },
      {
        memberId: 'm3',
        name: 'Name m3',
        roles: ['member', 'bursar', 'teacher'],
      },
    ]);

    const blind = await service.get(withHeld('ac:read'), 'bursar');
    expect(blind.holderCount).toBe(2);
    expect(blind.holders).toBeUndefined();
    expect('holders' in blind).toBe(false);
  });

  it('names only holders on the caller’s campuses but counts every holder', async () => {
    const members = [
      member('m1', ['bursar'], ['x']),
      member('m2', ['bursar'], ['y']),
      member('m3', ['bursar']),
    ];
    const { service } = setup(baseRows(), members);

    const scoped = await service.get(onCampuses(['x']), 'bursar');
    expect(scoped.holderCount).toBe(3);
    expect(scoped.holders?.map((holder) => holder.memberId)).toEqual(['m1']);

    const nobody = await service.get(onCampuses([]), 'bursar');
    expect(nobody.holderCount).toBe(3);
    expect(nobody.holders).toEqual([]);
  });

  it('hides portal-only members from a campus-scoped caller except on their own role', async () => {
    const members = [
      member('staff', ['bursar'], ['x']),
      member('pupil', ['student'], ['x']),
    ];
    const { service } = setup(baseRows(), members);
    const scope = onCampuses(['x']);

    const everyone = await service.get(scope, 'member');
    expect(everyone.holderCount).toBe(2);
    expect(everyone.holders?.map((holder) => holder.memberId)).toEqual([
      'staff',
    ]);

    const students = await service.get(scope, 'student');
    expect(students.holders?.map((holder) => holder.memberId)).toEqual([
      'pupil',
    ]);
  });

  it('counts the owners as Owner holders and every member as Member holders', async () => {
    const members = [member('m1', ['owner']), member('m2', [])];
    const { service } = setup(baseRows(), members);
    expect((await service.get(context(), 'owner')).holderCount).toBe(1);
    expect((await service.get(context(), 'member')).holderCount).toBe(2);
  });

  it('marks editable by rule 5 for the caller', async () => {
    const { service } = setup();
    const caller = withHeld('ac:read', 'ac:update', 'student:read');
    const { items } = await service.list(caller);
    const editable = Object.fromEntries(
      items.map((item) => [item.slug, item.editable])
    );
    expect(editable['owner']).toBe(false);
    expect(editable['member']).toBe(false);
    expect(editable['bursar']).toBe(true);
    expect(editable['administrator']).toBe(false);
    expect(editable['student']).toBe(true);

    const readOnly = await service.get(
      withHeld('ac:read', 'student:read'),
      'bursar'
    );
    expect(readOnly.editable).toBe(false);
  });

  it('answers 404 Role not found for a slug outside the school', async () => {
    const { service } = setup();
    const error = await rejection(service.get(context(), 'ghost'));
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe('Role not found');
  });
});

const body = (overrides = {}) => ({
  label: 'Cashier',
  description: 'Takes cash',
  permissions: toPermissionMap(['student:read']),
  ...overrides,
});

describe('RolesService.create', () => {
  it('writes a custom role under the school lock and returns it', async () => {
    const { service, admin } = setup();
    const created = await service.create(context(), body());
    expect(admin.underSchoolLock).toHaveBeenCalledWith(
      ORG,
      expect.any(Function)
    );
    expect(admin.create).toHaveBeenCalledWith({
      organizationId: ORG,
      slug: 'cashier',
      label: 'Cashier',
      description: 'Takes cash',
      permissions: { student: ['read'] },
    });
    expect(created).toMatchObject({
      slug: 'cashier',
      label: 'Cashier',
      source: 'custom',
      editable: true,
      holderCount: 0,
    });
  });

  it('stores a missing description as null and drops duplicate actions', async () => {
    const { service, admin } = setup();
    await service.create(context(), {
      label: 'Cashier',
      permissions: { student: ['read', 'read'] },
    });
    expect(admin.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
        permissions: { student: ['read'] },
      })
    );
  });

  it('keeps a valid free slug from the body', async () => {
    const { service } = setup();
    const created = await service.create(
      context(),
      body({ slug: 'fees-approver', label: 'Approves fees' })
    );
    expect(created.slug).toBe('fees-approver');
  });

  it('derives a new slug when the given one is taken, and when none is given', async () => {
    const { service, admin } = setup();
    await service.create(context(), body({ slug: 'teacher' }));
    expect(admin.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ slug: 'cashier' })
    );
    await service.create(context(), body({ label: 'Cash Ier' }));
    expect(admin.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ slug: 'cash-ier' })
    );
  });

  it('suffixes -2 and -3 when the derived slug is taken', async () => {
    const { service, admin } = setup([
      ...baseRows(),
      row('head-of-maths', { source: 'custom', label: 'Maths lead' }),
      row('head-of-maths-2', { source: 'custom', label: 'Maths lead two' }),
    ]);
    await service.create(context(), body({ label: 'Head of Maths' }));
    expect(admin.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'head-of-maths-3' })
    );
  });

  it('derives a safe slug from a label that is Owner or Member', async () => {
    const { service } = setup();
    const error = await rejection(
      service.create(context(), body({ label: 'Owner' }))
    );
    expect(error).toBeInstanceOf(ConflictException);
  });

  it('answers 400 for a permission that is not listed or an invalid slug, before any write', async () => {
    const { service, writes } = setup();
    const unknown = await rejection(
      service.create(
        context(),
        body({ permissions: { student: ['read', 'delete'] } })
      )
    );
    expect(unknown).toBeInstanceOf(BadRequestException);
    expect(responseOf(unknown)['issues']).toEqual([
      { path: 'student:delete', message: 'Unknown permission' },
    ]);
    for (const slug of ['Owner', 'owner', 'admin', 'new', 'a', 'has space']) {
      expect(
        await rejection(service.create(context(), body({ slug })))
      ).toBeInstanceOf(BadRequestException);
    }
    noWrites(writes);
  });

  it('answers 403 ROLE_ESCALATION listing each permission the caller lacks', async () => {
    const { service, writes } = setup();
    const caller = withHeld('ac:create', 'student:read');
    const error = await rejection(
      service.create(
        caller,
        body({
          permissions: toPermissionMap([
            'student:read',
            'member:create',
            'team:read',
          ]),
        })
      )
    );
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(responseOf(error)).toEqual({
      code: 'ROLE_ESCALATION',
      message:
        'You can’t give access you don’t have yourself. Switch those parts off and save again.',
      issues: [
        { path: 'team:read', message: 'Campuses: read' },
        { path: 'member:create', message: 'Staff: create' },
      ],
    });
    noWrites(writes);
  });

  it('answers 400 TOO_MANY_ROLES at the cap, counting ready-made rows', async () => {
    const rows = Array.from({ length: MAX_ROLES_PER_SCHOOL }, (_, index) =>
      row(`role-${index}`, { source: index < 6 ? 'starter' : 'custom' })
    );
    const { service, writes } = setup(rows);
    const error = await rejection(service.create(context(), body()));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(responseOf(error)['code']).toBe('TOO_MANY_ROLES');
    noWrites(writes);
  });

  it('allows the last row below the cap', async () => {
    const rows = Array.from({ length: MAX_ROLES_PER_SCHOOL - 1 }, (_, index) =>
      row(`role-${index}`, { source: 'custom' })
    );
    const { service } = setup(rows);
    await expect(service.create(context(), body())).resolves.toMatchObject({
      slug: 'cashier',
    });
  });

  it('answers 409 ROLE_LABEL_TAKEN ignoring case, for Owner and Member too', async () => {
    const { service, writes } = setup();
    for (const label of ['bursar', 'BURSAR', ' Bursar ', 'owner', 'MEMBER']) {
      const error = await rejection(service.create(context(), body({ label })));
      expect(error).toBeInstanceOf(ConflictException);
      expect(responseOf(error)).toMatchObject({
        code: 'ROLE_LABEL_TAKEN',
        message: `A role called ${label} already exists.`,
      });
    }
    noWrites(writes);
  });

  it('checks escalation before the cap and the label', async () => {
    const { service } = setup();
    const error = await rejection(
      service.create(
        withHeld('ac:create'),
        body({
          label: 'Bursar',
          permissions: toPermissionMap(['member:create']),
        })
      )
    );
    expect(responseOf(error)['code']).toBe('ROLE_ESCALATION');
  });
});

describe('RolesService.update', () => {
  it('refuses Owner and Member with 409 BUILT_IN_ROLE even though they have no row', async () => {
    const { service, writes } = setup();
    for (const slug of ['owner', 'member']) {
      const error = await rejection(
        service.update(context(), slug, { label: 'Boss' })
      );
      expect(error).toBeInstanceOf(ConflictException);
      expect(responseOf(error)['code']).toBe('BUILT_IN_ROLE');
    }
    noWrites(writes);
  });

  it('answers 404 for a slug outside the school', async () => {
    const { service, writes } = setup();
    expect(
      await rejection(service.update(context(), 'ghost', { label: 'X' }))
    ).toBeInstanceOf(NotFoundException);
    noWrites(writes);
  });

  it('renames without passing a slug and keeps the slug', async () => {
    const { service, admin } = setup();
    const updated = await service.update(context(), 'bursar', {
      label: 'Fees clerk',
      description: null,
    });
    expect(updated).toMatchObject({ slug: 'bursar', label: 'Fees clerk' });
    expect(admin.update).toHaveBeenCalledTimes(1);
    const [key, changes] = admin.update.mock.calls[0] ?? [];
    expect(key).toEqual({ organizationId: ORG, slug: 'bursar' });
    expect(
      Object.keys(changes ?? {}).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['description', 'label', 'permissions']);
    expect(changes).not.toHaveProperty('slug');
    expect(changes).not.toHaveProperty('role');
    expect(changes?.permissions).toBeUndefined();
  });

  it('writes new permissions', async () => {
    const { service, admin } = setup();
    const updated = await service.update(context(), 'bursar', {
      permissions: toPermissionMap(['student:read', 'student:create']),
    });
    expect(admin.update).toHaveBeenCalledWith(
      { organizationId: ORG, slug: 'bursar' },
      expect.objectContaining({
        permissions: { student: ['read', 'create'] },
      })
    );
    expect(updated.permissions).toEqual({ student: ['read', 'create'] });
  });

  it('refuses a role the caller does not fully hold, even for a rename (rule 5, before)', async () => {
    const { service, writes } = setup();
    const error = await rejection(
      service.update(withHeld('ac:update', 'student:read'), 'administrator', {
        label: 'Boss',
      })
    );
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(responseOf(error)).toMatchObject({ code: 'ROLE_ESCALATION' });
    expect(responseOf(error)['issues']).toEqual([
      { path: 'member:read', message: 'Staff: read' },
      { path: 'ac:read', message: 'Roles: read' },
    ]);
    noWrites(writes);
  });

  it('refuses new permissions the caller lacks (rule 5, after)', async () => {
    const { service, writes } = setup();
    const error = await rejection(
      service.update(withHeld('ac:update', 'student:read'), 'bursar', {
        permissions: toPermissionMap(['student:read', 'member:create']),
      })
    );
    expect(responseOf(error)['code']).toBe('ROLE_ESCALATION');
    expect(responseOf(error)['issues']).toEqual([
      { path: 'member:create', message: 'Staff: create' },
    ]);
    noWrites(writes);
  });

  it('answers 400 for an unlisted permission', async () => {
    const { service, writes } = setup();
    expect(
      await rejection(
        service.update(context(), 'bursar', {
          permissions: { student: ['delete'] },
        })
      )
    ).toBeInstanceOf(BadRequestException);
    noWrites(writes);
  });

  it('answers 409 when the new label belongs to another role, but not to itself', async () => {
    const { service, admin } = setup();
    const error = await rejection(
      service.update(context(), 'bursar', { label: 'TEACHER' })
    );
    expect(responseOf(error)).toMatchObject({
      code: 'ROLE_LABEL_TAKEN',
      message: 'A role called TEACHER already exists.',
    });
    expect(
      await rejection(service.update(context(), 'bursar', { label: 'BURSAR' }))
    ).not.toBeInstanceOf(Error);
    expect(admin.update).toHaveBeenCalledTimes(1);
    expect(
      await rejection(service.update(context(), 'bursar', { label: 'member' }))
    ).toBeInstanceOf(ConflictException);
  });

  it('writes nothing for an empty change', async () => {
    const { service, writes } = setup();
    await expect(
      service.update(context(), 'bursar', {})
    ).resolves.toMatchObject({
      slug: 'bursar',
    });
    noWrites(writes);
  });
});

describe('RolesService.remove', () => {
  it('refuses Owner and Member with 409 BUILT_IN_ROLE', async () => {
    const { service, writes } = setup();
    for (const slug of ['owner', 'member']) {
      const error = await rejection(service.remove(context(), slug));
      expect(responseOf(error)['code']).toBe('BUILT_IN_ROLE');
    }
    noWrites(writes);
  });

  it('answers 404 for a slug outside the school', async () => {
    const { service, writes } = setup();
    expect(await rejection(service.remove(context(), 'ghost'))).toBeInstanceOf(
      NotFoundException
    );
    noWrites(writes);
  });

  it('refuses Student and Guardian even when nobody holds them', async () => {
    const { service, writes } = setup();
    for (const slug of ['student', 'guardian']) {
      const error = await rejection(service.remove(context(), slug));
      expect(error).toBeInstanceOf(ConflictException);
      expect(responseOf(error)).toMatchObject({
        code: 'ROLE_PROTECTED',
        message: 'Admissions use this role.',
      });
    }
    noWrites(writes);
  });

  it('refuses a role the caller does not fully hold', async () => {
    const { service, writes } = setup();
    const error = await rejection(
      service.remove(withHeld('ac:delete', 'student:read'), 'administrator')
    );
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(responseOf(error)['code']).toBe('ROLE_ESCALATION');
    noWrites(writes);
  });

  it('names the holders with member:read', async () => {
    const { service, writes } = setup(baseRows(), [
      member('m1', ['bursar']),
      member('m2', ['bursar']),
    ]);
    const error = await rejection(service.remove(context(), 'bursar'));
    expect(error).toBeInstanceOf(ConflictException);
    expect(responseOf(error)).toMatchObject({
      code: 'ROLE_IN_USE',
      message:
        'Name m1 and Name m2 still have this role. Take it off them first.',
    });
    noWrites(writes);
  });

  it('gives only a count when a holder is outside the caller’s campuses, and still refuses', async () => {
    const { service, writes } = setup(baseRows(), [
      member('m1', ['bursar'], ['x']),
      member('m2', ['bursar'], ['y']),
    ]);
    const error = await rejection(service.remove(onCampuses(['x']), 'bursar'));
    expect(error).toBeInstanceOf(ConflictException);
    expect(responseOf(error)['message']).toBe(
      '2 people still have this role. Take it off them first.'
    );
    noWrites(writes);
  });

  it('names the holders when all of them are on the caller’s campuses', async () => {
    const { service } = setup(baseRows(), [member('m1', ['bursar'], ['x'])]);
    const error = await rejection(service.remove(onCampuses(['x']), 'bursar'));
    expect(responseOf(error)['message']).toBe(
      'Name m1 still has this role. Take it off them first.'
    );
  });

  it('gives only a count without member:read', async () => {
    const { service } = setup(baseRows(), [member('m1', ['bursar'])]);
    const error = await rejection(
      service.remove(withHeld('ac:delete', 'student:read'), 'bursar')
    );
    expect(responseOf(error)['message']).toBe(
      '1 person still has this role. Take it off them first.'
    );
  });

  it('deletes an unheld role under the lock and answers its slug', async () => {
    const { service, admin, repository } = setup(baseRows(), [
      member('m1', ['teacher']),
    ]);
    const result = await service.remove(context(), 'bursar');
    expect(result).toEqual({ slug: 'bursar' });
    expect(admin.underSchoolLock).toHaveBeenCalledWith(
      ORG,
      expect.any(Function)
    );
    expect(admin.remove).toHaveBeenCalledWith({
      organizationId: ORG,
      slug: 'bursar',
    });
    expect(repository.rows.some((existing) => existing.slug === 'bursar')).toBe(
      false
    );
  });
});
