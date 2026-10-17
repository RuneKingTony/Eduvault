import {
  ADJUSTMENT_REASON_MESSAGE,
  DISCOUNT_PERCENT_MESSAGE,
  DISCOUNT_UNTIL_MESSAGE,
  DISCOUNT_VALUE_MESSAGE,
} from '@eduvault/api-contract';
import {
  WHOLE_CHARGE,
  toDiscountBody,
  validateDiscount,
  valueOf,
  type DiscountState,
} from './discount-model';

const ADA = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const TUITION = '2b6d9f10-4c8a-4e7b-9a1c-3d5e7f9b1a2c';
const T2 = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const T3 = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';

const state = (over: Partial<DiscountState> = {}): DiscountState => ({
  studentId: ADA,
  kind: 'percent',
  value: '50',
  feeTypeId: TUITION,
  fromTermId: T2,
  toTermId: '',
  reason: 'Scholarship',
  ...over,
});

describe('valueOf', () => {
  it('reads a percentage as a whole number and a fixed amount as naira in minor units', () => {
    expect(valueOf({ kind: 'percent', value: ' 50 ' })).toBe(50);
    expect(valueOf({ kind: 'percent', value: '12.5' })).toBeUndefined();
    expect(valueOf({ kind: 'fixed', value: '15,000' })).toBe(1_500_000);
    expect(valueOf({ kind: 'fixed', value: 'lots' })).toBeUndefined();
  });
});

describe('validateDiscount', () => {
  it('accepts a complete discount', () => {
    expect(validateDiscount(state(), false)).toEqual({});
  });

  it('asks for a student and a value above zero', () => {
    for (const change of [{ studentId: '' }, { value: '' }, { value: '0' }]) {
      expect(validateDiscount(state(change), false).student).toBe(
        DISCOUNT_VALUE_MESSAGE
      );
    }
  });

  it('refuses a percentage above 100', () => {
    expect(validateDiscount(state({ value: '120' }), false).value).toBe(
      DISCOUNT_PERCENT_MESSAGE
    );
    expect(validateDiscount(state({ value: '100' }), false)).toEqual({});
  });

  it('refuses an Until before From, but only when one is chosen', () => {
    expect(validateDiscount(state({ toTermId: T3 }), true).until).toBe(
      DISCOUNT_UNTIL_MESSAGE
    );
    expect(
      validateDiscount(state({ toTermId: '' }), true).until
    ).toBeUndefined();
  });

  it('asks for a reason', () => {
    expect(validateDiscount(state({ reason: ' ' }), false).reason).toBe(
      ADJUSTMENT_REASON_MESSAGE
    );
  });
});

describe('toDiscountBody', () => {
  it('sends the fee type, the terms and a null end by default', () => {
    expect(toDiscountBody(state())).toEqual({
      studentId: ADA,
      kind: 'percent',
      value: 50,
      ledgerAccountId: TUITION,
      fromTermId: T2,
      toTermId: null,
      reason: 'Scholarship',
    });
  });

  it('sends a null fee type for the whole charge and a fixed amount in minor units', () => {
    expect(
      toDiscountBody(
        state({
          kind: 'fixed',
          value: '15,000',
          feeTypeId: WHOLE_CHARGE,
          toTermId: T3,
        })
      )
    ).toMatchObject({
      kind: 'fixed',
      value: 1_500_000,
      ledgerAccountId: null,
      toTermId: T3,
    });
  });
});
