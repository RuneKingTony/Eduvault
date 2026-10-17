import { ALL_PERMISSIONS, PERM_HELP, SENSITIVE, permLabel } from './index';

describe('permLabel', () => {
  it('splits camelCase actions into words', () => {
    expect(permLabel('campus:readAll')).toBe('Campus reach: read all');
    expect(permLabel('student:create')).toBe('Students: create');
    expect(permLabel('team:read')).toBe('Campuses: read');
    expect(permLabel('member:create')).toBe('Staff: create');
  });
});

describe('statements', () => {
  it('has no student delete', () => {
    expect(ALL_PERMISSIONS).not.toContain('student:delete');
  });

  it('has the student lifecycle permissions with help and no delete', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining(['student:archive', 'student:markAway'])
    );
    expect(SENSITIVE).not.toContain('student:archive');
    expect(permLabel('student:markAway')).toBe('Students: mark away');
    expect(PERM_HELP['student:archive']).toBe(
      'Records students leaving or graduating, and undoes it in the same term.'
    );
    expect(PERM_HELP['student:markAway']).toBe(
      'Marks students not seen since a date, and back in school.'
    );
  });

  it('has student readOwn with help, not sensitive', () => {
    expect(ALL_PERMISSIONS).toContain('student:readOwn');
    expect(SENSITIVE).not.toContain('student:readOwn');
    expect(permLabel('student:readOwn')).toBe('Students: read own');
    expect(PERM_HELP['student:readOwn']).toBe(
      'Students see their own records. Guardians see their own children.'
    );
  });

  it('has the feeLine resource, with no feeSchedule and none sensitive', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'feeLine:create',
        'feeLine:read',
        'feeLine:readOwn',
        'feeLine:update',
        'feeLine:retire',
      ])
    );
    expect(ALL_PERMISSIONS.some((p) => p.startsWith('feeSchedule'))).toBe(
      false
    );
    expect(SENSITIVE.some((p) => p.startsWith('feeLine'))).toBe(false);
    expect(permLabel('feeLine:retire')).toBe('School and other fees: retire');
  });

  it('has the invoice resource with help, none sensitive', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'invoice:bill',
        'invoice:read',
        'invoice:readOwn',
      ])
    );
    expect(SENSITIVE.some((p) => p.startsWith('invoice'))).toBe(false);
    expect(permLabel('invoice:bill')).toBe('Charges: bill');
    expect(PERM_HELP['invoice:bill']).toBeDefined();
    expect(PERM_HELP['invoice:read']).toBeDefined();
    expect(PERM_HELP['invoice:readOwn']).toBeDefined();
  });

  it('has the payment resource with help, none sensitive', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'payment:record',
        'payment:read',
        'payment:readOwn',
        'payment:void',
      ])
    );
    expect(SENSITIVE.some((p) => p.startsWith('payment'))).toBe(false);
    expect(permLabel('payment:record')).toBe('Payments: record');
    expect(PERM_HELP['payment:record']).toBeDefined();
    expect(PERM_HELP['payment:read']).toBeDefined();
    expect(PERM_HELP['payment:readOwn']).toBe(
      'Students see their own payments. Guardians see their children’s.'
    );
    expect(PERM_HELP['payment:void']).toBeDefined();
  });

  it('has the adjustment resource with help and a label, none sensitive', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'adjustment:create',
        'adjustment:read',
        'adjustment:approve',
      ])
    );
    expect(SENSITIVE.some((p) => p.startsWith('adjustment'))).toBe(false);
    expect(permLabel('adjustment:approve')).toBe(
      'Discounts and refunds: approve'
    );
    expect(PERM_HELP['adjustment:create']).toBeDefined();
    expect(PERM_HELP['adjustment:read']).toBeDefined();
    expect(PERM_HELP['adjustment:approve']).toBeDefined();
  });

  it('has announcement create, read and update, with no delete and none sensitive', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'announcement:create',
        'announcement:read',
        'announcement:update',
      ])
    );
    expect(ALL_PERMISSIONS).not.toContain('announcement:delete');
    expect(SENSITIVE).not.toContain('announcement:update');
    expect(permLabel('announcement:update')).toBe('Announcements: update');
  });

  it('has the ledger and money account resources, with only manageAccounts sensitive', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'ledger:read',
        'ledger:manageAccounts',
        'moneyAccount:create',
        'moneyAccount:read',
        'moneyAccount:update',
      ])
    );
    expect(SENSITIVE).toContain('ledger:manageAccounts');
    expect(SENSITIVE).not.toContain('ledger:read');
    expect(SENSITIVE).not.toContain('moneyAccount:create');
    expect(permLabel('ledger:manageAccounts')).toBe(
      'Money categories: manage accounts'
    );
    expect(permLabel('moneyAccount:read')).toBe('Bank and POS accounts: read');
    expect(PERM_HELP['ledger:manageAccounts']).toBeDefined();
  });

  it('has the store resource with no sensitive action', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining(['store:read', 'store:receive', 'store:issue'])
    );
    expect(SENSITIVE.filter((item) => item.startsWith('store:'))).toEqual([]);
    expect(permLabel('store:receive')).toBe('Store: receive');
    expect(permLabel('store:issue')).toBe('Store: issue');
    expect(PERM_HELP['store:issue']).toBe(
      'Records student purchases at the store, on the campuses they see.'
    );
    expect(PERM_HELP['store:read']).toBeDefined();
    expect(PERM_HELP['store:receive']).toBeDefined();
  });

  it('has the subject resource with no sensitive action', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'subject:create',
        'subject:read',
        'subject:update',
      ])
    );
    expect(ALL_PERMISSIONS).not.toContain('subject:delete');
    expect(SENSITIVE.filter((item) => item.startsWith('subject:'))).toEqual([]);
    expect(permLabel('subject:update')).toBe('Subjects: update');
    expect(PERM_HELP['subject:update']).toBeDefined();
  });

  it('has the member resource and marks adding and removing sensitive', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'member:create',
        'member:read',
        'member:update',
        'member:delete',
      ])
    );
    expect(SENSITIVE).toEqual(
      expect.arrayContaining(['member:create', 'member:delete'])
    );
    expect(PERM_HELP['member:create']).toBeDefined();
    expect(PERM_HELP['member:update']).toBeDefined();
  });

  it('has the ac resource, marks creating, changing and deleting roles sensitive and explains ac:create', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining(['ac:create', 'ac:read', 'ac:update', 'ac:delete'])
    );
    expect(SENSITIVE).toEqual(
      expect.arrayContaining(['ac:create', 'ac:update', 'ac:delete'])
    );
    expect(SENSITIVE).not.toContain('ac:read');
    expect(PERM_HELP['ac:create']).toBe(
      'Creates roles, using only what they can do themselves.'
    );
    expect(permLabel('ac:update')).toBe('Roles: update');
  });

  it('has no schoolAccount create or delete and lists organization update and delete as sensitive', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'schoolAccount:read',
        'schoolAccount:update',
        'organization:update',
        'organization:delete',
      ])
    );
    expect(ALL_PERMISSIONS).not.toContain('schoolAccount:create');
    expect(ALL_PERMISSIONS).not.toContain('schoolAccount:delete');
    expect(SENSITIVE).toEqual(
      expect.arrayContaining(['organization:update', 'organization:delete'])
    );
    expect(permLabel('organization:delete')).toBe('School: delete');
  });

  it('has the session resource with a setCurrent permission and its help', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'session:create',
        'session:read',
        'session:update',
        'session:setCurrent',
      ])
    );
    expect(ALL_PERMISSIONS).not.toContain('session:delete');
    expect(permLabel('session:setCurrent')).toBe(
      'School years and terms: set current'
    );
    expect(PERM_HELP['session:setCurrent']).toBe(
      'Chooses which term is current.'
    );
  });

  it('has the class resource with readAll and assignTeacher help and no delete', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'class:create',
        'class:read',
        'class:readAll',
        'class:update',
        'class:assignTeacher',
      ])
    );
    expect(ALL_PERMISSIONS).not.toContain('class:delete');
    expect(permLabel('class:assignTeacher')).toBe('Classes: assign teacher');
    expect(PERM_HELP['class:readAll']).toBe(
      'Sees every class. Without it a member with class access sees only the classes they teach.'
    );
    expect(PERM_HELP['class:assignTeacher']).toBeDefined();
  });

  it('has the enrollment and guardian resources with their labels and help', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'enrollment:create',
        'enrollment:read',
        'enrollment:place',
        'guardian:create',
        'guardian:read',
        'guardian:update',
        'guardian:link',
      ])
    );
    expect(permLabel('enrollment:place')).toBe('Enrolment: place');
    expect(permLabel('guardian:link')).toBe('Guardians: link');
    expect(PERM_HELP['guardian:create']).toBeDefined();
    expect(PERM_HELP['guardian:link']).toBeDefined();
  });

  it('keeps SENSITIVE and PERM_HELP to listed permissions', () => {
    for (const permission of SENSITIVE) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
    for (const permission of Object.keys(PERM_HELP)) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
  });
});
