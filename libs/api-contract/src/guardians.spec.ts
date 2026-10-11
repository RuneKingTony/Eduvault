import {
  editGuardianSchema,
  guardianDraftSchema,
  guardianSummarySchema,
  loginCredentialSchema,
  maxGuardiansMessage,
  newGuardianSchema,
  updateGuardianLinkSchema,
} from './guardians';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const fresh = {
  fullName: '  Ngozi Okeke ',
  phone: ' +234 801 234-5678 ',
  address: ' 4 Palm Close ',
  relationship: 'mother',
  login: { kind: 'email', email: ' NGOZI@Example.com ' },
};

const parsesPhone = (value: string) =>
  newGuardianSchema.safeParse({ ...fresh, phone: value }).success;

describe('newGuardianSchema', () => {
  it('trims the name, phone, address and email and lower-cases the email', () => {
    const parsed = newGuardianSchema.parse(fresh);
    expect(parsed.fullName).toBe('Ngozi Okeke');
    expect(parsed.phone).toBe('+234 801 234-5678');
    expect(parsed.address).toBe('4 Palm Close');
    expect(parsed.login).toEqual({ kind: 'email', email: 'ngozi@example.com' });
    expect(parsed.paysFees).toBe(false);
  });

  it('refuses a blank name or address with the screen copy', () => {
    const name = newGuardianSchema.safeParse({ ...fresh, fullName: '  ' });
    const address = newGuardianSchema.safeParse({ ...fresh, address: '' });
    expect(name.error?.issues[0]?.message).toBe(
      'Enter the guardian’s full name.'
    );
    expect(address.error?.issues[0]?.message).toBe('Enter the house address.');
  });

  it('takes a phone of 7 to 20 digits, spaces, plus and hyphen', () => {
    expect(parsesPhone('1234567')).toBe(true);
    expect(parsesPhone('+234 801-234-5678')).toBe(true);
    expect(parsesPhone('123456')).toBe(false);
    expect(parsesPhone('1'.repeat(21))).toBe(false);
    expect(parsesPhone('0801 abc 5678')).toBe(false);
  });

  it('needs an email for the email login and none for the username login', () => {
    expect(
      newGuardianSchema.safeParse({ ...fresh, login: { kind: 'email' } })
        .success
    ).toBe(false);
    expect(
      newGuardianSchema.safeParse({
        ...fresh,
        login: { kind: 'email', email: 'nope' },
      }).error?.issues[0]?.message
    ).toBe('Enter a valid email.');
    expect(
      newGuardianSchema.safeParse({ ...fresh, login: { kind: 'username' } })
        .success
    ).toBe(true);
    expect(
      newGuardianSchema.safeParse({ ...fresh, login: { kind: 'sms' } }).success
    ).toBe(false);
  });
});

describe('guardianDraftSchema', () => {
  it('accepts an existing guardian id or a new guardian and nothing else', () => {
    expect(
      guardianDraftSchema.safeParse({
        existingGuardianId: id,
        relationship: 'father',
      }).success
    ).toBe(true);
    expect(guardianDraftSchema.safeParse({ new: fresh }).success).toBe(true);
    expect(guardianDraftSchema.safeParse({}).success).toBe(false);
    expect(
      guardianDraftSchema.safeParse({ existingGuardianId: 'x' }).success
    ).toBe(false);
  });
});

describe('guardian response shapes', () => {
  it('lets a summary outside the viewer’s scope carry the name only', () => {
    expect(
      guardianSummarySchema.parse({
        id,
        fullName: 'Ifeanyi Okeke',
        outsideScope: true,
      })
    ).toEqual({ id, fullName: 'Ifeanyi Okeke', outsideScope: true });
  });

  it('marks a login that was not created with no password', () => {
    expect(
      loginCredentialSchema.safeParse({
        who: 'guardian',
        name: 'Ngozi',
        existing: true,
      }).success
    ).toBe(true);
  });
});

describe('edit schemas', () => {
  it('takes a null photo to remove it and refuses unknown keys', () => {
    expect(editGuardianSchema.parse({ photoFileId: null })).toEqual({
      photoFileId: null,
    });
    expect(editGuardianSchema.safeParse({ email: 'a@b.co' }).success).toBe(
      false
    );
    expect(
      updateGuardianLinkSchema.safeParse({ paysFees: false }).success
    ).toBe(true);
  });

  it('words the guardian maximum in the singular and plural', () => {
    expect(maxGuardiansMessage(1)).toBe(
      'A student can have at most 1 guardian.'
    );
    expect(maxGuardiansMessage(4)).toBe(
      'A student can have at most 4 guardians.'
    );
  });
});
