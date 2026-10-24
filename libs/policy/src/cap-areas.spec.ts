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

describe('the Subjects area', () => {
  const subjects = area('subjects');

  it('sits in School between Classes and Students and describes its changes', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('subjects')).toBe(ids.indexOf('students') - 1);
    expect(subjects.group).toBe('School');
    expect(subjects.label).toBe('Subjects');
    expect(subjects.important).toBe(false);
    expect(subjects.see).toEqual(['subject:read']);
    expect(subjects.change).toEqual(['subject:create', 'subject:update']);
    expect(subjects.changeDesc).toBe('Add and change subjects');
    expect(subjects.extras).toEqual([]);
  });

  it('is see for subject:read alone and custom for a lone subject:update', () => {
    expect(capLevel(toPermissionMap(['subject:read']), subjects)).toBe('see');
    expect(capLevel(toPermissionMap(['subject:update']), subjects)).toBe(
      'custom'
    );
  });

  it('keeps choosing teachers in the Classes area', () => {
    expect(subjects.change).not.toContain('class:assignTeacher');
    expect(area('classes').change).toContain('class:assignTeacher');
  });
});

describe('the Classes area', () => {
  const classes = area('classes');

  it('sits in School before Subjects and splits seeing from changing', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('classes')).toBe(ids.indexOf('subjects') - 1);
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
      'Approves staff leave',
      'Roles: create roles and change what they allow',
      'School settings: change the school profile and rules',
      'Hands over the school',
      'Deletes the school',
      'School years and terms: add school years, holidays and set the current term',
      'Classes: add, archive and restore classes, change levels and name class teachers',
      'Sees every class',
      'Subjects: add and change subjects',
      'Students: admit students, update them and put them in classes',
      'Records leavers and graduates',
      'Marks students away',
      'Parents and guardians: add guardians and link them to students',
      'Announcements: write, publish, pin and withdraw announcements',
      'Fees: set and change what each class pays',
      'Charges: charge students, send the charges and add one-off charges',
      'Payments: record payments and issue receipts',
      'Asks to cancel payments',
      'Discounts and refunds: ask for refunds, fee reductions, cancelled balances and discounts',
      'Approves money requests',
      'Bank and POS accounts: add and change bank and POS accounts',
      'Store: add items, record deliveries, sell to students and count stock',
      'Wallets: record money families pay into their wallets',
      'Asks for wallet refunds',
      'Approves wallet refunds',
      'Manages the payment gateway',
      'Money categories: change the accountant’s categories',
      'Own records: can see',
      'Sees fees',
      'Uses the family wallet',
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
      'Subjects: add and change subjects',
      'Students: admit students, update them and put them in classes',
      'Records leavers and graduates',
      'Marks students away',
      'Parents and guardians: add guardians and link them to students',
      'Announcements: write, publish, pin and withdraw announcements',
      'Fees: can see',
      'Charges: can see',
      'Payments: can see',
      'Store: can see',
      'Wallets: can see',
    ]);
  });

  it('describes the teacher and bursar', () => {
    expect(summaryFor('teacher')).toEqual([
      'Classes: can see',
      'Subjects: can see',
      'Students: can see',
      'Marks students away',
    ]);
    expect(summaryFor('bursar')).toEqual([
      'Students: can see',
      'Parents and guardians: can see',
      'Fees: set and change what each class pays',
      'Charges: charge students, send the charges and add one-off charges',
      'Payments: record payments and issue receipts',
      'Asks to cancel payments',
      'Discounts and refunds: ask for refunds, fee reductions, cancelled balances and discounts',
      'Bank and POS accounts: can see',
      'Store: add items, record deliveries, sell to students and count stock',
      'Wallets: record money families pay into their wallets',
      'Asks for wallet refunds',
      'Money categories: can see',
    ]);
  });

  it('describes the principal', () => {
    expect(summaryFor('principal')).toEqual([
      'Campuses: can see',
      'Sees every campus',
      'Approves staff leave',
      'Classes: can see',
      'Sees every class',
      'Subjects: can see',
      'Students: can see',
      'Announcements: write, publish, pin and withdraw announcements',
      'Charges: can see',
      'Payments: can see',
      'Discounts and refunds: can see',
      'Approves money requests',
      'Bank and POS accounts: can see',
      'Store: can see',
      'Wallets: can see',
      'Approves wallet refunds',
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

describe('the Announcements area', () => {
  const announcements = area('announcements');

  it('puts read under see and create and update under change, in School', () => {
    expect(announcements.group).toBe('School');
    expect(announcements.label).toBe('Announcements');
    expect(announcements.see).toEqual(['announcement:read']);
    expect(announcements.change).toEqual([
      'announcement:create',
      'announcement:update',
    ]);
    expect(announcements.extras).toEqual([]);
  });
});

describe('the Fees area', () => {
  const fees = area('fees');

  it('sits in Money after Announcements and splits seeing from changing', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('fees')).toBe(ids.indexOf('announcements') + 1);
    expect(fees.group).toBe('Money');
    expect(fees.label).toBe('Fees');
    expect(fees.see).toEqual(['feeLine:read']);
    expect(fees.change).toEqual([
      'feeLine:create',
      'feeLine:update',
      'feeLine:retire',
    ]);
    expect(fees.changeDesc).toBe('Set and change what each class pays');
    expect(fees.important).toBe(false);
  });

  it('is see for feeLine:read, change for all four and custom for a lone create', () => {
    expect(capLevel(toPermissionMap(['feeLine:read']), fees)).toBe('see');
    expect(
      capLevel(
        toPermissionMap([
          'feeLine:read',
          'feeLine:create',
          'feeLine:update',
          'feeLine:retire',
        ]),
        fees
      )
    ).toBe('change');
    expect(capLevel(toPermissionMap(['feeLine:create']), fees)).toBe('custom');
  });

  it('keeps feeLine:readOwn in the Portal area, not the legacy list', () => {
    expect(LEGACY_PERMISSIONS).not.toContain('feeLine:readOwn');
    expect(area('portal').extras[0]?.permissions).toContain('feeLine:readOwn');
  });
});

describe('the Charges area', () => {
  const charges = area('charges');

  it('sits in Money after Fees and splits seeing from charging', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('charges')).toBe(ids.indexOf('fees') + 1);
    expect(charges.group).toBe('Money');
    expect(charges.label).toBe('Charges');
    expect(charges.see).toEqual(['invoice:read']);
    expect(charges.change).toEqual(['invoice:bill', 'invoice:charge']);
    expect(charges.changeDesc).toBe(
      'Charge students, send the charges and add one-off charges'
    );
    expect(charges.important).toBe(false);
  });

  it('is see for invoice:read, change with bill and charge, and custom without both', () => {
    expect(capLevel(toPermissionMap(['invoice:read']), charges)).toBe('see');
    expect(
      capLevel(
        toPermissionMap(['invoice:read', 'invoice:bill', 'invoice:charge']),
        charges
      )
    ).toBe('change');
    expect(
      capLevel(toPermissionMap(['invoice:read', 'invoice:bill']), charges)
    ).toBe('see');
    expect(capLevel(toPermissionMap(['invoice:bill']), charges)).toBe('custom');
    expect(capLevel(toPermissionMap(['invoice:charge']), charges)).toBe(
      'custom'
    );
  });

  it('keeps invoice:readOwn in the Portal area, not the legacy list', () => {
    expect(LEGACY_PERMISSIONS).not.toContain('invoice:readOwn');
    expect(area('portal').extras[0]?.permissions).toContain('invoice:readOwn');
  });

  it('summarises the bursar as able to charge and the administrator as able to see', () => {
    expect(summaryFor('bursar')).toContain(
      'Charges: charge students, send the charges and add one-off charges'
    );
    expect(summaryFor('administrator')).toContain('Charges: can see');
    expect(summaryFor('principal')).toContain('Charges: can see');
    expect(summaryFor('teacher')).not.toContain('Charges: can see');
  });
});

describe('the Payments area', () => {
  const payments = area('payments');

  it('sits in Money, splitting seeing from recording, with cancelling as an extra', () => {
    expect(payments.group).toBe('Money');
    expect(payments.label).toBe('Payments');
    expect(payments.see).toEqual(['payment:read']);
    expect(payments.change).toEqual(['payment:record']);
    expect(payments.extras.map((extra) => extra.permissions)).toEqual([
      ['payment:void'],
    ]);
    expect(LEGACY_PERMISSIONS).not.toContain('payment:void');
  });

  it('is see for payment:read, change with payment:record and custom for a lone record', () => {
    expect(capLevel(toPermissionMap(['payment:read']), payments)).toBe('see');
    expect(
      capLevel(toPermissionMap(['payment:read', 'payment:record']), payments)
    ).toBe('change');
    expect(capLevel(toPermissionMap(['payment:record']), payments)).toBe(
      'custom'
    );
  });
});

describe('the Discounts and refunds area', () => {
  const adjustments = area('discounts-refunds');

  it('sits in Money after Payments, with approving as an important extra', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('discounts-refunds')).toBe(ids.indexOf('payments') + 1);
    expect(adjustments.group).toBe('Money');
    expect(adjustments.label).toBe('Discounts and refunds');
    expect(adjustments.see).toEqual(['adjustment:read']);
    expect(adjustments.change).toEqual(['adjustment:create']);
    expect(adjustments.extras).toEqual([
      expect.objectContaining({
        permissions: ['adjustment:approve'],
        important: true,
      }),
    ]);
  });

  it('is see for adjustment:read and change with adjustment:create', () => {
    expect(capLevel(toPermissionMap(['adjustment:read']), adjustments)).toBe(
      'see'
    );
    expect(
      capLevel(
        toPermissionMap(['adjustment:read', 'adjustment:create']),
        adjustments
      )
    ).toBe('change');
    expect(capLevel(toPermissionMap(['adjustment:approve']), adjustments)).toBe(
      'none'
    );
  });
});

describe('the Money areas', () => {
  const accounts = area('money-accounts');
  const categories = area('money-categories');

  it('sit in Money after Charges and before Own records', () => {
    const ids = CAP_AREAS.map((candidate) => candidate.id);
    expect(ids.indexOf('payments')).toBe(ids.indexOf('charges') + 1);
    expect(ids.indexOf('money-accounts')).toBe(
      ids.indexOf('discounts-refunds') + 1
    );
    expect(ids.indexOf('store')).toBe(ids.indexOf('money-accounts') + 1);
    expect(ids.indexOf('wallets')).toBe(ids.indexOf('store') + 1);
    expect(ids.indexOf('money-categories')).toBe(ids.indexOf('wallets') + 1);
    expect(ids.indexOf('portal')).toBe(ids.indexOf('money-categories') + 1);
    expect(accounts.group).toBe('Money');
    expect(categories.group).toBe('Money');
  });

  it('split seeing from changing and flag only the categories as important', () => {
    expect(accounts.label).toBe('Bank and POS accounts');
    expect(accounts.see).toEqual(['moneyAccount:read']);
    expect(accounts.change).toEqual([
      'moneyAccount:create',
      'moneyAccount:update',
    ]);
    expect(accounts.changeDesc).toBe('Add and change bank and POS accounts');
    expect(accounts.important).toBe(false);
    expect(categories.label).toBe('Money categories');
    expect(categories.see).toEqual(['ledger:read']);
    expect(categories.change).toEqual(['ledger:manageAccounts']);
    expect(categories.changeDesc).toBe('Change the accountant’s categories');
    expect(categories.important).toBe(true);
  });

  it('is custom for a lone write, and see for ledger:read', () => {
    expect(capLevel(toPermissionMap(['moneyAccount:update']), accounts)).toBe(
      'custom'
    );
    expect(
      capLevel(toPermissionMap(['ledger:manageAccounts']), categories)
    ).toBe('custom');
    expect(capLevel(toPermissionMap(['ledger:read']), categories)).toBe('see');
  });
});

describe('the Store area', () => {
  const store = area('store');

  it('sits in Money, splitting seeing from receiving stock', () => {
    expect(store.group).toBe('Money');
    expect(store.label).toBe('Store');
    expect(store.see).toEqual(['store:read']);
    expect(store.change).toEqual([
      'store:receive',
      'store:issue',
      'store:count',
    ]);
    expect(store.changeDesc).toBe(
      'Add items, record deliveries, sell to students and count stock'
    );
    expect(store.extras).toEqual([]);
    expect(store.important).toBe(false);
  });

  it('is see for store:read, change with receive, issue and count, and custom for a lone receive, issue or count', () => {
    expect(capLevel(toPermissionMap(['store:read']), store)).toBe('see');
    expect(
      capLevel(
        toPermissionMap([
          'store:read',
          'store:receive',
          'store:issue',
          'store:count',
        ]),
        store
      )
    ).toBe('change');
    expect(capLevel(toPermissionMap(['store:receive']), store)).toBe('custom');
    expect(capLevel(toPermissionMap(['store:issue']), store)).toBe('custom');
    expect(capLevel(toPermissionMap(['store:count']), store)).toBe('custom');
  });
});

describe('the Portal area', () => {
  const portal = area('portal');

  it('holds student:readOwn under see, with no change set and a Sees fees extra', () => {
    expect(portal.group).toBe('Portal');
    expect(portal.label).toBe('Own records');
    expect(portal.see).toEqual(['student:readOwn']);
    expect(portal.change).toEqual([]);
    expect(portal.extras).toEqual([
      expect.objectContaining({
        label: 'Sees fees',
        description: 'Charges, payments and the family statement.',
        permissions: ['invoice:readOwn', 'payment:readOwn', 'feeLine:readOwn'],
        important: false,
      }),
      expect.objectContaining({
        label: 'Uses the family wallet',
        permissions: ['wallet:readOwn', 'wallet:spend'],
        important: false,
      }),
    ]);
  });

  it('summarises the student as own records that see fees and the guardian as also using the wallet', () => {
    expect(summaryFor('student')).toEqual([
      'Own records: can see',
      'Sees fees',
    ]);
    expect(summaryFor('guardian')).toEqual([
      'Own records: can see',
      'Sees fees',
      'Uses the family wallet',
    ]);
    expect(summaryFor('teacher')).not.toContain('Own records: can see');
  });
});

describe('the Wallets area', () => {
  const wallets = area('wallets');

  it('sits in Money, splitting seeing from topping up, with the refund and gateway grants as extras', () => {
    expect(wallets.group).toBe('Money');
    expect(wallets.label).toBe('Wallets');
    expect(wallets.see).toEqual(['wallet:read']);
    expect(wallets.change).toEqual(['wallet:topUp']);
    expect(wallets.extras.map((extra) => extra.permissions)).toEqual([
      ['wallet:requestRefund'],
      ['wallet:approveRefund'],
      ['wallet:manageGateway'],
    ]);
  });

  it('is see for wallet:read, change with wallet:topUp and custom for a lone top-up', () => {
    expect(capLevel(toPermissionMap(['wallet:read']), wallets)).toBe('see');
    expect(
      capLevel(toPermissionMap(['wallet:read', 'wallet:topUp']), wallets)
    ).toBe('change');
    expect(capLevel(toPermissionMap(['wallet:topUp']), wallets)).toBe('custom');
  });
});

describe('the Staff area leave extra', () => {
  const staff = CAP_AREAS.find((a) => a.id === 'staff');

  it('offers approving leave as an important extra and leaves the levels alone', () => {
    expect(staff?.extras).toEqual([
      {
        label: 'Approves staff leave',
        description:
          'Approves or declines leave requests from other people, never their own.',
        permissions: ['leave:approve'],
        important: true,
      },
    ]);
    expect(staff?.see).toEqual(['member:read']);
    expect(staff?.change).not.toContain('leave:approve');
  });

  it('is none for a lone leave:approve, with the extra listed', () => {
    const lone = toPermissionMap(['leave:approve']);
    expect(capLevel(lone, staff!)).toBe('none');
    expect(capSummary(lone)).toEqual(['Approves staff leave']);
  });
});
