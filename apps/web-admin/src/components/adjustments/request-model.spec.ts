import {
  ADJUSTMENT_ACCOUNT_REQUIRED_MESSAGE,
  ADJUSTMENT_REASON_MESSAGE,
  ADJUSTMENT_STUDENT_AMOUNT_MESSAGE,
} from '@eduvault/api-contract';
import {
  initialRequest,
  toRequestBody,
  validateRequest,
  withAccount,
  type RequestState,
} from './request-model';

const ADA = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const CHARGE = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const GTBANK = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';

const state = (over: Partial<RequestState> = {}): RequestState => ({
  kind: 'credit_note',
  studentId: ADA,
  amount: '10,000',
  reason: 'Late enrolment',
  invoiceId: '',
  ledgerAccountId: '',
  moneyAccountId: GTBANK,
  ...over,
});

describe('initialRequest', () => {
  it('starts as a fee reduction with the first money account and nothing else filled', () => {
    expect(initialRequest({}, GTBANK)).toEqual({
      kind: 'credit_note',
      studentId: '',
      amount: '',
      reason: '',
      invoiceId: '',
      ledgerAccountId: '',
      moneyAccountId: GTBANK,
    });
  });

  it('opens as a refund of the credit held for "Pay the extra back"', () => {
    expect(
      initialRequest(
        { kind: 'refund', studentId: ADA, amountMinor: 500_000 },
        GTBANK
      )
    ).toMatchObject({ kind: 'refund', studentId: ADA, amount: '5000' });
  });
});

describe('validateRequest', () => {
  it('accepts a complete request', () => {
    expect(validateRequest(state())).toEqual({});
  });

  it('asks for a student and an amount above zero', () => {
    for (const change of [
      { studentId: '' },
      { amount: '' },
      { amount: '0' },
      { amount: 'ten' },
    ]) {
      expect(validateRequest(state(change)).student).toBe(
        ADJUSTMENT_STUDENT_AMOUNT_MESSAGE
      );
    }
  });

  it('asks for a reason', () => {
    expect(validateRequest(state({ reason: '   ' })).reason).toBe(
      ADJUSTMENT_REASON_MESSAGE
    );
  });

  it('asks a refund for the account it is paid from', () => {
    expect(
      validateRequest(state({ kind: 'refund', moneyAccountId: '' })).account
    ).toBe(ADJUSTMENT_ACCOUNT_REQUIRED_MESSAGE);
    expect(
      validateRequest(state({ kind: 'credit_note', moneyAccountId: '' }))
    ).toEqual({});
  });
});

describe('toRequestBody', () => {
  it('sends a fee reduction with the account and charge only when chosen', () => {
    expect(toRequestBody(state())).toEqual({
      kind: 'credit_note',
      studentId: ADA,
      amountMinor: 1_000_000,
      reason: 'Late enrolment',
    });
    expect(
      toRequestBody(state({ ledgerAccountId: GTBANK, invoiceId: CHARGE }))
    ).toMatchObject({ ledgerAccountId: GTBANK, invoiceId: CHARGE });
  });

  it('sends a refund with its money account and nothing from the fee reduction fields', () => {
    expect(
      toRequestBody(
        state({ kind: 'refund', invoiceId: CHARGE, ledgerAccountId: CHARGE })
      )
    ).toEqual({
      kind: 'refund',
      studentId: ADA,
      amountMinor: 1_000_000,
      reason: 'Late enrolment',
      moneyAccountId: GTBANK,
    });
  });

  it('sends a cancelled balance with no accounts and a trimmed reason', () => {
    expect(
      toRequestBody(
        state({
          kind: 'write_off',
          reason: ' Left the school ',
          moneyAccountId: GTBANK,
        })
      )
    ).toEqual({
      kind: 'write_off',
      studentId: ADA,
      amountMinor: 1_000_000,
      reason: 'Left the school',
    });
  });
});

describe('withAccount', () => {
  it('pays a refund from the first account offered until another is picked', () => {
    expect(
      withAccount(state({ kind: 'refund', moneyAccountId: '' }), [
        { id: GTBANK },
        { id: CHARGE },
      ]).moneyAccountId
    ).toBe(GTBANK);
    expect(
      withAccount(state({ moneyAccountId: CHARGE }), [{ id: GTBANK }])
        .moneyAccountId
    ).toBe(CHARGE);
    expect(withAccount(state({ moneyAccountId: '' }), []).moneyAccountId).toBe(
      ''
    );
  });
});
