import {
  createRoleSchema,
  roleInUseMessage,
  roleLabelTakenMessage,
  updateRoleSchema,
} from './schemas';

describe('createRoleSchema', () => {
  it('trims the label and turns a blank description into null', () => {
    const parsed = createRoleSchema.parse({
      label: '  Cashier  ',
      description: '   ',
      permissions: {},
    });
    expect(parsed.label).toBe('Cashier');
    expect(parsed.description).toBeNull();
  });

  it('keeps a description and leaves a missing one missing', () => {
    expect(
      createRoleSchema.parse({
        label: 'A',
        description: ' Takes cash ',
        permissions: {},
      }).description
    ).toBe('Takes cash');
    expect(
      createRoleSchema.parse({ label: 'A', permissions: {} }).description
    ).toBeUndefined();
  });

  it('limits the label to 40 and the description to 200 characters', () => {
    const ok = { permissions: {} };
    expect(
      createRoleSchema.safeParse({ ...ok, label: 'a'.repeat(40) }).success
    ).toBe(true);
    expect(
      createRoleSchema.safeParse({ ...ok, label: 'a'.repeat(41) }).success
    ).toBe(false);
    expect(
      createRoleSchema.safeParse({
        ...ok,
        label: 'A',
        description: 'd'.repeat(200),
      }).success
    ).toBe(true);
    expect(
      createRoleSchema.safeParse({
        ...ok,
        label: 'A',
        description: 'd'.repeat(201),
      }).success
    ).toBe(false);
  });

  it('refuses a blank label with the shared copy', () => {
    const result = createRoleSchema.safeParse({ label: '  ', permissions: {} });
    expect(result.error?.issues[0]?.message).toBe(
      'Give the role a name first.'
    );
  });

  it('refuses a resource or action that is not listed', () => {
    expect(
      createRoleSchema.safeParse({
        label: 'A',
        permissions: { ghost: ['read'] },
      }).success
    ).toBe(false);
    expect(
      createRoleSchema.safeParse({
        label: 'A',
        permissions: { student: ['fly'] },
      }).success
    ).toBe(false);
  });
});

describe('updateRoleSchema', () => {
  it('accepts a partial body and drops a slug', () => {
    expect(
      updateRoleSchema.parse({ label: 'New name', slug: 'sneaky' })
    ).toEqual({ label: 'New name' });
    expect(updateRoleSchema.parse({})).toEqual({});
  });
});

describe('role messages', () => {
  it('names the clashing label', () => {
    expect(roleLabelTakenMessage('Bursar')).toBe(
      'A role called Bursar already exists.'
    );
  });

  it('names holders, with the right verb, or counts them', () => {
    expect(roleInUseMessage(['Kemi'])).toBe(
      'Kemi still has this role. Take it off them first.'
    );
    expect(roleInUseMessage(['Kemi', 'Ada'])).toBe(
      'Kemi and Ada still have this role. Take it off them first.'
    );
    expect(roleInUseMessage(['Kemi', 'Ada', 'Chi'])).toBe(
      'Kemi, Ada, and Chi still have this role. Take it off them first.'
    );
    expect(roleInUseMessage(3)).toBe(
      '3 people still have this role. Take it off them first.'
    );
    expect(roleInUseMessage(1)).toBe(
      '1 person still has this role. Take it off them first.'
    );
  });
});
