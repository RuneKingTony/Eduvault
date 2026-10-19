import {
  ALL_PERMISSIONS,
  ROLE_TEMPLATES,
  applyRoleTemplate,
  availableRoleTemplates,
  deriveRoleSlug,
  isValidRoleSlug,
  toPermissionMap,
  type Permission,
  type RoleTemplate,
} from './index';

const template = (key: string): RoleTemplate => {
  const found = ROLE_TEMPLATES.find((candidate) => candidate.key === key);
  if (found === undefined) {
    throw new Error(`no template ${key}`);
  }
  return found;
};

describe('ROLE_TEMPLATES', () => {
  it('only uses permissions that exist', () => {
    for (const { permissions } of ROLE_TEMPLATES) {
      for (const permission of permissions) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
  });

  it('gives Fees approver five permissions and Campus head ten', () => {
    expect(template('fees-approver').permissions).toHaveLength(5);
    expect(template('campus-head').permissions).toHaveLength(10);
  });

  it('keys each template with a valid slug that matches its label', () => {
    for (const { key, label } of ROLE_TEMPLATES) {
      expect(isValidRoleSlug(key)).toBe(true);
      expect(key).toBe(deriveRoleSlug(label, []));
    }
  });
});

describe('availableRoleTemplates', () => {
  it('offers every template when the whole list exists', () => {
    expect(availableRoleTemplates().map(({ key }) => key)).toEqual([
      'fees-approver',
      'campus-head',
    ]);
  });

  it('drops a template when one of its permissions is not listed', () => {
    const listed = ALL_PERMISSIONS.filter(
      (permission) => permission !== 'adjustment:approve'
    );
    expect(availableRoleTemplates(listed).map(({ key }) => key)).toEqual([
      'campus-head',
    ]);
  });
});

describe('applyRoleTemplate', () => {
  it('fills the name, description and slug', () => {
    const applied = applyRoleTemplate(template('campus-head'), {});
    expect(applied).toMatchObject({
      label: 'Campus head',
      description: 'Everything for one campus except money approvals.',
      slug: 'campus-head',
    });
  });

  it('keeps only what the editor holds and lists the rest as skipped', () => {
    const editor = toPermissionMap([
      'student:read',
      'invoice:read',
      'payment:read',
      'adjustment:read',
    ]);
    const { kept, skipped } = applyRoleTemplate(
      template('fees-approver'),
      editor
    );
    expect(kept).toEqual(editor);
    expect(skipped).toEqual<Permission[]>(['adjustment:approve']);
  });

  it('skips nothing for the owner', () => {
    const { kept, skipped } = applyRoleTemplate(
      template('fees-approver'),
      toPermissionMap(ALL_PERMISSIONS)
    );
    expect(skipped).toEqual([]);
    expect(kept).toEqual(
      toPermissionMap(template('fees-approver').permissions)
    );
  });
});
