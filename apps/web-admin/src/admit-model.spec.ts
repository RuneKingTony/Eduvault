import {
  admitBody,
  addedGuardian,
  canAdmit,
  canRemoveGuardian,
  initialAdmitForm,
  studentErrors,
} from './admit-model';

describe('initialAdmitForm', () => {
  it('starts at the student step with Guardian 1 as a new mother who pays', () => {
    const form = initialAdmitForm({ canLink: true, canCreate: true });
    expect(form.step).toBe(0);
    expect(form.gender).toBe('F');
    expect(form.guardians).toHaveLength(1);
    expect(form.guardians[0]).toMatchObject({
      mode: 'new',
      relationship: 'mother',
      paysFees: true,
      loginKind: 'email',
    });
  });

  it('starts existing without guardian:create and empty without guardian:link', () => {
    expect(
      initialAdmitForm({ canLink: true, canCreate: false }).guardians[0]?.mode
    ).toBe('existing');
    expect(
      initialAdmitForm({ canLink: false, canCreate: false }).guardians
    ).toEqual([]);
  });

  it('adds guardians as an existing father who does not pay', () => {
    expect(addedGuardian(2)).toMatchObject({
      mode: 'existing',
      relationship: 'father',
      paysFees: false,
    });
  });
});

describe('studentErrors', () => {
  const form = {
    ...initialAdmitForm({ canLink: true, canCreate: true }),
    firstName: 'Peace',
    lastName: 'Udoh',
    dateOfBirth: '2014-03-03',
  };

  it('is empty for a complete step', () => {
    expect(studentErrors(form, '2026-10-11')).toEqual({});
  });

  it('uses the server copy for blank names and a missing or future birth date', () => {
    expect(
      studentErrors(
        { ...form, firstName: ' ', lastName: '', dateOfBirth: '' },
        '2026-10-11'
      )
    ).toEqual({
      firstName: 'Enter the first name.',
      lastName: 'Enter the last name.',
      dateOfBirth: 'Choose a date of birth on or before today.',
    });
    expect(
      studentErrors({ ...form, dateOfBirth: '2026-10-12' }, '2026-10-11')
        .dateOfBirth
    ).toBeDefined();
    expect(
      studentErrors({ ...form, dateOfBirth: '2026-10-11' }, '2026-10-11')
    ).toEqual({});
  });
});

describe('canRemoveGuardian', () => {
  it('keeps Guardian 1 while a guardian is required and lets the others go', () => {
    expect(canRemoveGuardian(0, true)).toBe(false);
    expect(canRemoveGuardian(0, false)).toBe(true);
    expect(canRemoveGuardian(1, true)).toBe(true);
  });
});

describe('canAdmit', () => {
  it('hides Admit for a member who cannot link while a guardian is required', () => {
    expect(
      canAdmit({
        canCreateStudent: true,
        canLink: false,
        requireGuardian: true,
      })
    ).toBe(false);
    expect(
      canAdmit({
        canCreateStudent: true,
        canLink: false,
        requireGuardian: false,
      })
    ).toBe(true);
    expect(
      canAdmit({ canCreateStudent: true, canLink: true, requireGuardian: true })
    ).toBe(true);
    expect(
      canAdmit({
        canCreateStudent: false,
        canLink: true,
        requireGuardian: false,
      })
    ).toBe(false);
  });

  it('shows the button while the rule is unknown, and the server decides', () => {
    expect(
      canAdmit({
        canCreateStudent: true,
        canLink: false,
        requireGuardian: undefined,
      })
    ).toBe(true);
  });
});

describe('admitBody', () => {
  it('builds the request from the form, one body per guardian draft', () => {
    const form = {
      ...initialAdmitForm({ canLink: true, canCreate: true }),
      firstName: 'Peace',
      lastName: 'Udoh',
      dateOfBirth: '2014-03-03',
      classArmId: 'arm-1',
    };
    const body = admitBody({
      ...form,
      guardians: [
        {
          ...form.guardians[0]!,
          fullName: 'Mrs Udoh',
          phone: '08012345678',
          address: '4 Palm Close',
          loginKind: 'username',
        },
      ],
    });
    expect(body).toMatchObject({
      firstName: 'Peace',
      classArmId: 'arm-1',
      guardians: [
        { new: { fullName: 'Mrs Udoh', login: { kind: 'username' } } },
      ],
    });
  });
});
