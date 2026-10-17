import {
  FILE_KINDS,
  RECEIPT_FOOTER_MESSAGE,
  createCampusSchema,
  schoolSettingsSchema,
  updateApprovalRulesSchema,
  updatePaymentRulesSchema,
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

describe('receipt footer in updateSchoolSettingsSchema', () => {
  it('keeps 120 characters and refuses 121', () => {
    expect(
      updateSchoolSettingsSchema.parse({
        receiptFooter: ` ${'a'.repeat(120)} `,
      }).receiptFooter
    ).toBe('a'.repeat(120));
    expect(
      messages(
        updateSchoolSettingsSchema.safeParse({
          receiptFooter: 'a'.repeat(121),
        })
      )
    ).toEqual([RECEIPT_FOOTER_MESSAGE]);
  });

  it('allows an empty footer', () => {
    expect(
      updateSchoolSettingsSchema.parse({ receiptFooter: '  ' }).receiptFooter
    ).toBe('');
  });
});

describe('updatePaymentRulesSchema', () => {
  it('takes any subset of the three methods', () => {
    expect(updatePaymentRulesSchema.parse({ pos: false })).toEqual({
      pos: false,
    });
    expect(
      updatePaymentRulesSchema.parse({ cash: true, transfer: false, pos: true })
    ).toEqual({ cash: true, transfer: false, pos: true });
  });

  it('refuses a method that is not one of the three', () => {
    expect(updatePaymentRulesSchema.safeParse({ gateway: true }).success).toBe(
      false
    );
  });
});

describe('schoolSettingsSchema', () => {
  it('carries the payment methods and the receipt footer', () => {
    expect(
      schoolSettingsSchema.parse({
        maxGuardians: 4,
        requireGuardian: true,
        paymentMethods: { cash: true, transfer: true, pos: false },
        receiptFooter: 'Thank you for your payment.',
        approvalRules: {
          refund: true,
          writeOff: true,
          creditNote: true,
          discount: true,
          paymentVoid: true,
        },
        approvers: ['Owner', 'Principal'],
      }).paymentMethods
    ).toEqual({ cash: true, transfer: true, pos: false });
  });
});

describe('updateApprovalRulesSchema', () => {
  it('takes any subset of the five switches', () => {
    expect(updateApprovalRulesSchema.parse({ refund: false })).toEqual({
      refund: false,
    });
    expect(
      updateApprovalRulesSchema.parse({ writeOff: true, paymentVoid: false })
    ).toEqual({ writeOff: true, paymentVoid: false });
  });

  it('refuses a kind that has no switch and a non-boolean', () => {
    expect(updateApprovalRulesSchema.safeParse({ leave: false }).success).toBe(
      false
    );
    expect(updateApprovalRulesSchema.safeParse({ refund: 'no' }).success).toBe(
      false
    );
  });
});

describe('FILE_KINDS', () => {
  it('includes the payment proof', () => {
    expect(FILE_KINDS).toContain('payment_proof');
  });
});
