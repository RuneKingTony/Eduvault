import {
  INVOICE_CHARGE_AMOUNT_MESSAGE,
  INVOICE_CHARGE_DESCRIPTION_MAX_MESSAGE,
  INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE,
  createOneOffChargeSchema,
} from '@eduvault/api-contract';
import {
  CHOOSE_FEE_TYPE_MESSAGE,
  CHOOSE_STUDENT_MESSAGE,
  addLine,
  canAddLine,
  canRemoveLine,
  chargeAddedMessage,
  chargeBody,
  chargeTotalMinor,
  hasErrors,
  initialCharge,
  removeLine,
  validateCharge,
  withLine,
  withStudent,
  type NewChargeState,
} from './new-charge-model';

const ADA = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const TUITION = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const BUS = 'a1111111-1111-4111-8111-111111111111';

const filled = (): NewChargeState => {
  let state = withStudent(initialCharge('ONEOFF-20261018-1B9D6BCD'), ADA);
  state = withLine(state, 0, {
    feeTypeId: TUITION,
    description: '  School trip ',
    amount: '15,000',
  });
  state = addLine(state);
  return withLine(state, 1, {
    feeTypeId: BUS,
    description: 'ID card',
    amount: '2500.50',
  });
};

describe('initialCharge', () => {
  it('starts with no student and one blank line, keeping the reference', () => {
    const state = initialCharge('ONEOFF-1');
    expect(state.reference).toBe('ONEOFF-1');
    expect(state.studentId).toBe('');
    expect(state.lines).toEqual([
      { key: 0, feeTypeId: '', description: '', amount: '' },
    ]);
  });
});

describe('lines', () => {
  it('adds lines with their own keys, up to 20', () => {
    let state = initialCharge('ONEOFF-1');
    for (let index = 0; index < 25; index += 1) {
      state = addLine(state);
    }
    expect(state.lines).toHaveLength(20);
    expect(new Set(state.lines.map((line) => line.key)).size).toBe(20);
    expect(canAddLine(state)).toBe(false);
  });

  it('removes a line by key but never the last one', () => {
    const state = filled();
    const fewer = removeLine(state, 0);
    expect(fewer.lines.map((line) => line.key)).toEqual([1]);
    expect(canRemoveLine(fewer)).toBe(false);
    expect(removeLine(fewer, 1)).toBe(fewer);
  });

  it('keeps the key of a new line unique after a removal', () => {
    const state = addLine(removeLine(filled(), 0));
    expect(state.lines.map((line) => line.key)).toEqual([1, 2]);
  });
});

describe('chargeTotalMinor', () => {
  it('adds the valid amounts in kobo, whatever the commas and decimals', () => {
    expect(chargeTotalMinor(filled())).toBe(1_500_000 + 250_050);
  });

  it('leaves out a blank or invalid amount', () => {
    const state = withLine(filled(), 1, { amount: 'abc' });
    expect(chargeTotalMinor(state)).toBe(1_500_000);
  });
});

describe('validateCharge', () => {
  it('is clean for a filled form', () => {
    expect(hasErrors(validateCharge(filled()))).toBe(false);
  });

  it('asks for a student and a fee type, a description and an amount above zero', () => {
    const errors = validateCharge(initialCharge('ONEOFF-1'));
    expect(errors.student).toBe(CHOOSE_STUDENT_MESSAGE);
    expect(errors.lines[0]).toEqual({
      feeType: CHOOSE_FEE_TYPE_MESSAGE,
      description: INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE,
      amount: INVOICE_CHARGE_AMOUNT_MESSAGE,
    });
    expect(hasErrors(errors)).toBe(true);
  });

  it('refuses a zero, negative, three-decimal or over-large amount', () => {
    for (const amount of ['0', '-5', '10.123', '99,999,999,999,999']) {
      const errors = validateCharge(withLine(filled(), 0, { amount }));
      expect(errors.lines[0]).toEqual({
        amount: INVOICE_CHARGE_AMOUNT_MESSAGE,
      });
    }
  });

  it('refuses a blank or too-long description, counted after trimming', () => {
    const blank = validateCharge(withLine(filled(), 0, { description: '   ' }));
    expect(blank.lines[0]).toEqual({
      description: INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE,
    });
    const long = validateCharge(
      withLine(filled(), 0, { description: 'x'.repeat(301) })
    );
    expect(long.lines[0]).toEqual({
      description: INVOICE_CHARGE_DESCRIPTION_MAX_MESSAGE,
    });
    const padded = validateCharge(
      withLine(filled(), 0, { description: ` ${'x'.repeat(300)} ` })
    );
    expect(hasErrors(padded)).toBe(false);
  });

  it('reports each line under its own key', () => {
    const errors = validateCharge(withLine(filled(), 1, { feeTypeId: '' }));
    expect(Object.keys(errors.lines)).toEqual(['1']);
  });
});

describe('chargeBody', () => {
  it('builds the request the contract accepts, with the reference, trimmed text and kobo', () => {
    const body = chargeBody(filled());
    expect(body).toEqual({
      studentId: ADA,
      reference: 'ONEOFF-20261018-1B9D6BCD',
      lines: [
        {
          feeTypeId: TUITION,
          description: 'School trip',
          amountMinor: 1_500_000,
        },
        { feeTypeId: BUS, description: 'ID card', amountMinor: 250_050 },
      ],
    });
    expect(createOneOffChargeSchema.safeParse(body).success).toBe(true);
  });

  it('keeps the line order', () => {
    expect(chargeBody(filled()).lines.map((line) => line.description)).toEqual([
      'School trip',
      'ID card',
    ]);
  });
});

describe('chargeAddedMessage', () => {
  it('names the charge number', () => {
    expect(chargeAddedMessage('CHG-2026-00012')).toBe(
      'Charge CHG-2026-00012 added'
    );
    expect(chargeAddedMessage(null)).toBe('Charge added');
  });
});
