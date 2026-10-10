import {
  createCampusSchema,
  updateSchoolProfileSchema,
  updateSchoolSettingsSchema,
} from './schemas';

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

describe('createCampusSchema', () => {
  it('trims the name and keeps an address of 200 characters', () => {
    const parsed = createCampusSchema.parse({
      name: '  Ajah ',
      address: 'a'.repeat(200),
    });
    expect(parsed.name).toBe('Ajah');
  });

  it('refuses an empty name, a name over 60 and an address over 200', () => {
    expect(messages(createCampusSchema.safeParse({ name: ' ' }))).toEqual([
      'Give the campus a name.',
    ]);
    expect(createCampusSchema.safeParse({ name: 'a'.repeat(61) }).success).toBe(
      false
    );
    expect(
      createCampusSchema.safeParse({ name: 'Ajah', address: 'a'.repeat(201) })
        .success
    ).toBe(false);
  });
});

describe('updateSchoolProfileSchema', () => {
  it('turns cleared text into null and keeps untouched fields undefined', () => {
    expect(
      updateSchoolProfileSchema.parse({ phone: '', email: '', city: ' Lagos ' })
    ).toEqual({ phone: null, email: null, city: 'Lagos' });
  });

  it('refuses a currency, an empty name and a bad email', () => {
    expect(
      updateSchoolProfileSchema.safeParse({ currency: 'USD' }).success
    ).toBe(false);
    expect(messages(updateSchoolProfileSchema.safeParse({ name: '' }))).toEqual(
      ['Give the school a name.']
    );
    expect(
      messages(updateSchoolProfileSchema.safeParse({ email: 'nope' }))
    ).toEqual(['Enter an email address like info@school.ng.']);
  });
});

describe('updateSchoolSettingsSchema', () => {
  it('accepts 1 to 6 and refuses 0 and 7 with the one message', () => {
    expect(updateSchoolSettingsSchema.parse({ maxGuardians: 6 })).toEqual({
      maxGuardians: 6,
    });
    for (const maxGuardians of [0, 7, 2.5]) {
      expect(
        messages(updateSchoolSettingsSchema.safeParse({ maxGuardians }))
      ).toEqual(['Choose a number from 1 to 6.']);
    }
  });
});
