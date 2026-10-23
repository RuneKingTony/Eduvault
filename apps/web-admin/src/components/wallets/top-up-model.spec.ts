import {
  PAYMENT_PROOF_TYPE_MESSAGE,
  PAYMENT_REFERENCE_REQUIRED_MESSAGE,
  WALLET_AMOUNT_MESSAGE,
  WALLET_PROOF_REQUIRED_MESSAGE,
  type TopUpOptions,
} from '@eduvault/api-contract';
import {
  amountOf,
  confirmDetails,
  initialState,
  toRequest,
  validate,
  withMethod,
  type TopUpState,
} from './top-up-model';

const CASH = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const BANK = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';

const options: TopUpOptions = {
  currency: 'NGN',
  today: '2026-10-23',
  accounts: [
    { id: CASH, label: 'Front desk till', kind: 'cash' },
    { id: BANK, label: 'GTBank current · ending 4417', kind: 'bank' },
  ],
  methods: { cash: true, transfer: true, pos: false },
};

const fixed = () => new Uint8Array(6);

const filled = (over: Partial<TopUpState> = {}): TopUpState => ({
  ...initialState(options, fixed),
  amount: '50,000',
  ...over,
});

const receipt = new File(['x'], 'slip.pdf', { type: 'application/pdf' });

describe('initialState', () => {
  it('opens on cash, today and the till, with a generated reference', () => {
    expect(initialState(options, fixed)).toEqual({
      accountId: CASH,
      method: 'cash',
      amount: '',
      receivedOn: '2026-10-23',
      depositor: '',
      reference: 'CSH-20261023-AAAAAA',
      referenceTouched: false,
    });
  });

  it('opens on the first way of paying that is switched on', () => {
    const state = initialState(
      { ...options, methods: { cash: false, transfer: true, pos: true } },
      fixed
    );
    expect(state).toMatchObject({ method: 'transfer', accountId: BANK });
    expect(state.reference).toBe('TRF-20261023-AAAAAA');
  });
});

describe('withMethod', () => {
  it('swaps a generated reference and moves to an account that takes the method', () => {
    const next = withMethod(options, filled(), {
      method: 'transfer',
      fresh: 'TRF-20261023-ZZZZZZ',
    });
    expect(next).toMatchObject({
      method: 'transfer',
      accountId: BANK,
      reference: 'TRF-20261023-ZZZZZZ',
    });
  });

  it('keeps a reference the person typed, and an account that still fits', () => {
    const typed = filled({
      accountId: BANK,
      reference: 'MY-OWN-1',
      referenceTouched: true,
    });
    expect(
      withMethod(options, typed, {
        method: 'pos',
        fresh: 'POS-20261023-ZZZZZZ',
      })
    ).toMatchObject({ method: 'pos', accountId: BANK, reference: 'MY-OWN-1' });
  });
});

describe('validate', () => {
  it('passes a filled form with a chosen receipt or one already uploaded', () => {
    expect(validate(filled(), { file: receipt, uploaded: false })).toEqual({});
    expect(validate(filled(), { file: undefined, uploaded: true })).toEqual({});
  });

  it('asks for the receipt, the reference and an amount above zero', () => {
    expect(
      validate(filled({ amount: '', reference: '  ' }), {
        file: undefined,
        uploaded: false,
      })
    ).toEqual({
      receipt: WALLET_PROOF_REQUIRED_MESSAGE,
      reference: PAYMENT_REFERENCE_REQUIRED_MESSAGE,
      amount: WALLET_AMOUNT_MESSAGE,
    });
    expect(
      validate(filled({ amount: '0' }), { file: receipt, uploaded: false })
    ).toEqual({ amount: WALLET_AMOUNT_MESSAGE });
    expect(
      validate(filled({ amount: 'lots' }), { file: receipt, uploaded: false })
    ).toEqual({ amount: WALLET_AMOUNT_MESSAGE });
  });

  it('refuses a receipt that is not a photo, a screenshot or a PDF', () => {
    const word = new File(['x'], 'slip.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(validate(filled(), { file: word, uploaded: false })).toEqual({
      receipt: PAYMENT_PROOF_TYPE_MESSAGE,
    });
  });
});

describe('toRequest', () => {
  it('sends whole kobo, a trimmed reference and depositor, and the receipt file', () => {
    expect(
      toRequest(
        filled({
          amount: '50,000.50',
          depositor: '  Uncle Bode ',
          reference: ' CSH-1 ',
        }),
        'file-1'
      )
    ).toEqual({
      reference: 'CSH-1',
      moneyAccountId: CASH,
      method: 'cash',
      amountMinor: 5_000_050,
      receivedOn: '2026-10-23',
      depositorName: 'Uncle Bode',
      proofFileId: 'file-1',
    });
  });

  it('leaves the depositor out when it is blank', () => {
    expect(toRequest(filled(), 'file-1')).not.toHaveProperty('depositorName');
  });
});

describe('amountOf and confirmDetails', () => {
  it('reads grouped naira and treats text it cannot read as zero', () => {
    expect(amountOf({ amount: '1,250.5' })).toBe(125_050);
    expect(amountOf({ amount: 'x' })).toBe(0);
  });

  it('lists the family, the amount with kobo and the account', () => {
    expect(confirmDetails(options, filled(), 'Mrs Ojo')).toEqual([
      { label: 'Wallet', value: 'Mrs Ojo' },
      { label: 'Amount', value: '₦50,000.00' },
      { label: 'Into', value: 'Front desk till' },
    ]);
  });
});
