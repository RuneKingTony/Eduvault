import {
  INVOICE_CHARGE_AMOUNT_MESSAGE,
  INVOICE_CHARGE_DESCRIPTION_MAX_MESSAGE,
  INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE,
  INVOICE_CHARGE_LINES_MAX_MESSAGE,
  INVOICE_CHARGE_LINES_REQUIRED_MESSAGE,
  createOneOffChargeSchema,
  invoiceReferenceUsedMessage,
  oneOffChargeReference,
} from './invoices';

const student = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const feeType = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';

const line = {
  feeTypeId: feeType,
  description: 'School trip',
  amountMinor: 1_500_000,
};
const body = {
  studentId: student,
  reference: 'ONEOFF-20261018-1B9D6BCD',
  lines: [line],
};

const messagesOf = (input: unknown): string[] => {
  const result = createOneOffChargeSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
};

describe('oneOffChargeReference', () => {
  it('is ONEOFF, the compact date and the first 8 characters of the UUID', () => {
    expect(
      oneOffChargeReference(
        '2026-10-18',
        '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
      )
    ).toBe('ONEOFF-20261018-1B9D6BCD');
  });
});

describe('invoiceReferenceUsedMessage', () => {
  it('names the reference and the charge number', () => {
    expect(invoiceReferenceUsedMessage('ONEOFF-1', 'CHG-2026-00007')).toBe(
      'Reference ONEOFF-1 is already used by CHG-2026-00007.'
    );
  });
});

describe('createOneOffChargeSchema', () => {
  it('accepts a charge of one line and trims the text', () => {
    const parsed = createOneOffChargeSchema.parse({
      ...body,
      reference: '  ONEOFF-1  ',
      lines: [{ ...line, description: '  School trip  ' }],
    });
    expect(parsed.reference).toBe('ONEOFF-1');
    expect(parsed.lines[0]?.description).toBe('School trip');
  });

  it('accepts 20 lines and refuses none or 21', () => {
    expect(
      createOneOffChargeSchema.safeParse({
        ...body,
        lines: Array.from({ length: 20 }, () => line),
      }).success
    ).toBe(true);
    expect(messagesOf({ ...body, lines: [] })).toContain(
      INVOICE_CHARGE_LINES_REQUIRED_MESSAGE
    );
    expect(
      messagesOf({ ...body, lines: Array.from({ length: 21 }, () => line) })
    ).toContain(INVOICE_CHARGE_LINES_MAX_MESSAGE);
  });

  it('refuses a zero, negative, fractional or missing amount', () => {
    for (const amountMinor of [0, -100, 10.5, undefined]) {
      expect(
        messagesOf({ ...body, lines: [{ ...line, amountMinor }] })
      ).toEqual([INVOICE_CHARGE_AMOUNT_MESSAGE]);
    }
  });

  it('refuses a blank or too-long description', () => {
    expect(
      messagesOf({ ...body, lines: [{ ...line, description: '   ' }] })
    ).toEqual([INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE]);
    expect(
      messagesOf({
        ...body,
        lines: [{ ...line, description: 'x'.repeat(301) }],
      })
    ).toEqual([INVOICE_CHARGE_DESCRIPTION_MAX_MESSAGE]);
  });

  it('refuses a blank or too-long reference', () => {
    expect(messagesOf({ ...body, reference: ' ' })).toHaveLength(1);
    expect(messagesOf({ ...body, reference: 'x'.repeat(81) })).toHaveLength(1);
    expect(
      createOneOffChargeSchema.safeParse({ ...body, reference: 'x'.repeat(80) })
        .success
    ).toBe(true);
  });

  it('refuses a student or fee type that is not an id', () => {
    expect(messagesOf({ ...body, studentId: 'ada' })).toHaveLength(1);
    expect(
      messagesOf({ ...body, lines: [{ ...line, feeTypeId: 'tuition' }] })
    ).toHaveLength(1);
  });
});
