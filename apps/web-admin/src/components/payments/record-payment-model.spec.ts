import type { RecordingOptions } from '@eduvault/api-contract';
import { generatePaymentReference } from '@eduvault/shared';
import {
  FIELD_ORDER,
  SOMEONE_ELSE,
  childrenFor,
  initialState,
  nairaText,
  splitTotal,
  toRequest,
  validate,
  withAmount,
  withMethod,
  withPayer,
  withShare,
  withStudent,
} from './record-payment-model';

const ADA = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const CHIDI = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const TOBI = '7c9a0b3d-1f2e-4a5b-8c6d-9e0f1a2b3c4d';
const NGOZI = 'aaaaaaaa-1f2e-4a5b-8c6d-9e0f1a2b3c4d';
const EMEKA = 'bbbbbbbb-1f2e-4a5b-8c6d-9e0f1a2b3c4d';
const ACCOUNT = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';

const child = (studentId: string, name: string, owesMinor: number) => ({
  studentId,
  name,
  admissionNumber: `GF-${name}`,
  owesMinor,
});

const ada = child(ADA, 'Ada', 18_000_000);
const chidi = child(CHIDI, 'Chidi', 6_000_000);
const tobi = child(TOBI, 'Tobi', 6_000_000);

const options: RecordingOptions = {
  currency: 'NGN',
  today: '2026-10-07',
  accounts: [{ id: ACCOUNT, label: 'GTBank current · ending 4417' }],
  methods: { cash: true, transfer: true, pos: true },
  payers: [
    { guardianId: NGOZI, name: 'Ngozi Okeke', children: [ada, chidi, tobi] },
    {
      guardianId: EMEKA,
      name: 'Emeka Bello',
      children: [child('x', 'Zed', 0)],
    },
  ],
  students: [ada, chidi, tobi, child('x', 'Zed', -500_000)],
};

const random = () => Uint8Array.from([0, 1, 2, 3, 4, 5]);

describe('initialState', () => {
  it('opens on the first guardian, prefilling each child and the amount', () => {
    const state = initialState(options, {}, random);

    expect(state.payer).toBe(NGOZI);
    expect(state.shares).toEqual({
      [ADA]: '180000',
      [CHIDI]: '60000',
      [TOBI]: '60000',
    });
    expect(state.amount).toBe('300000');
    expect(state.paidOn).toBe('2026-10-07');
    expect(state.accountId).toBe(ACCOUNT);
    expect(state.method).toBe('cash');
    expect(state.reference).toBe('CSH-20261007-ABCDEF');
  });

  it('opens on the paying guardian the sheet was opened for', () => {
    expect(initialState(options, { guardianId: EMEKA }).payer).toBe(EMEKA);
  });

  it('falls back to Someone else with the student when no guardian pays', () => {
    const state = initialState(options, { studentId: CHIDI });
    expect(state.payer).toBe(SOMEONE_ELSE);
    expect(state.studentId).toBe(CHIDI);
    expect(state.shares).toEqual({ [CHIDI]: '60000' });
    expect(state.amount).toBe('60000');
  });

  it('starts on the first method that is switched on', () => {
    const state = initialState({
      ...options,
      methods: { cash: false, transfer: true, pos: true },
    });
    expect(state.method).toBe('transfer');
    expect(state.reference).toMatch(/^TRF-20261007-/);
  });

  it('is Someone else when there are no guardians', () => {
    expect(initialState({ ...options, payers: [] }).payer).toBe(SOMEONE_ELSE);
  });
});

describe('changing the payer, student and amount', () => {
  it('rebuilds the rows when the payer changes', () => {
    const state = withPayer(options, initialState(options), EMEKA);
    expect(childrenFor(options, state).map((row) => row.studentId)).toEqual([
      'x',
    ]);
    expect(state.amount).toBe('0');
  });

  it('rebuilds the single row when Someone else picks another student', () => {
    const base = withPayer(options, initialState(options), SOMEONE_ELSE);
    const state = withStudent(options, base, TOBI);
    expect(state.shares).toEqual({ [TOBI]: '60000' });
    expect(state.amount).toBe('60000');
  });

  it('spreads a smaller amount in order up to what each owes', () => {
    const state = withAmount(options, initialState(options), '200000');
    expect(state.shares).toEqual({
      [ADA]: '180000',
      [CHIDI]: '20000',
      [TOBI]: '0',
    });
  });

  it('puts anything above the total owed on the first child', () => {
    const state = withAmount(options, initialState(options), '320000');
    expect(state.shares).toEqual({
      [ADA]: '200000',
      [CHIDI]: '60000',
      [TOBI]: '60000',
    });
  });

  it('leaves an edited row as typed until the amount is edited again', () => {
    const edited = withShare(
      withAmount(options, initialState(options), '200000'),
      TOBI,
      '1500.50'
    );
    expect(edited.shares[TOBI]).toBe('1500.50');
    expect(splitTotal(edited)).toBe(18_000_000 + 2_000_000 + 150_050);
  });

  it('keeps the reference once typed, and follows the method until then', () => {
    const state = initialState(options, {}, random);
    expect(
      withMethod(
        state,
        'pos',
        generatePaymentReference('pos', '2026-10-07', random)
      ).reference
    ).toBe('POS-20261007-ABCDEF');
    const typed = { ...state, reference: 'MINE-1', referenceTouched: true };
    expect(withMethod(typed, 'pos', 'POS-20261007-ABCDEF').reference).toBe(
      'MINE-1'
    );
  });
});

describe('validate', () => {
  const ok = { file: undefined, uploaded: false };

  it('accepts a cash payment whose split matches', () => {
    expect(validate(initialState(options), ok)).toEqual({});
  });

  it('asks for the proof of a transfer, and refuses a Word document', () => {
    const transfer = { ...initialState(options), method: 'transfer' as const };
    expect(validate(transfer, ok).proof).toBe(
      'Add the proof of transfer (a photo, screenshot or PDF) before recording.'
    );
    const docx = new File(['x'], 'proof.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(validate(transfer, { file: docx, uploaded: false }).proof).toBe(
      'The proof must be a photo, a screenshot or a PDF.'
    );
    const pdf = new File(['x'], 'proof.pdf', { type: 'application/pdf' });
    expect(
      validate(transfer, { file: pdf, uploaded: false }).proof
    ).toBeUndefined();
    expect(
      validate(transfer, { file: undefined, uploaded: true }).proof
    ).toBeUndefined();
  });

  it('reports a blank reference, a zero amount, an empty split and a missing payer name', () => {
    const empty = {
      ...withPayer(options, initialState(options), SOMEONE_ELSE),
      reference: ' ',
      amount: '',
      studentId: '',
      shares: {},
    };
    const errors = validate(empty, ok);
    expect(Object.keys(errors)).toEqual([
      'reference',
      'amount',
      'split',
      'payerName',
    ]);
    expect(Object.keys(errors)).toEqual(
      FIELD_ORDER.filter((field) => field in errors)
    );
    expect(errors.amount).toBe('Enter the amount received.');
    expect(errors.split).toBe('Split the payment across at least one student.');
    expect(errors.payerName).toBe('Enter who paid.');
  });

  it('refuses a split that does not add up with the amounts in naira', () => {
    const state = withShare(initialState(options), ADA, '100000');
    expect(validate(state, ok).split).toBe(
      'Allocations add up to ₦220,000 but the payment is ₦300,000.'
    );
  });
});

describe('toRequest', () => {
  it('sends a guardian payer, the rows above zero and the proof of a transfer', () => {
    const state = {
      ...withAmount(options, initialState(options), '200000'),
      method: 'transfer' as const,
      providerReference: ' GTB/FT/1 ',
      reference: ' TRF-1 ',
    };

    expect(toRequest(options, state, 'proof-1')).toEqual({
      reference: 'TRF-1',
      payerGuardianId: NGOZI,
      moneyAccountId: ACCOUNT,
      method: 'transfer',
      providerReference: 'GTB/FT/1',
      proofFileId: 'proof-1',
      amountMinor: 20_000_000,
      paidOn: '2026-10-07',
      allocations: [
        { studentId: ADA, amountMinor: 18_000_000 },
        { studentId: CHIDI, amountMinor: 2_000_000 },
      ],
    });
  });

  it('sends a typed name for Someone else and no proof for cash', () => {
    const state = {
      ...withPayer(options, initialState(options), SOMEONE_ELSE),
      studentId: ADA,
      payerName: ' Mrs Ojo ',
    };
    const filled = withStudent(options, state, ADA);

    const request = toRequest(
      options,
      { ...filled, payerName: ' Mrs Ojo ' },
      'proof-1'
    );

    expect(request).toMatchObject({ payerName: 'Mrs Ojo', method: 'cash' });
    expect(request).not.toHaveProperty('payerGuardianId');
    expect(request).not.toHaveProperty('proofFileId');
    expect(request).not.toHaveProperty('providerReference');
  });
});

describe('nairaText', () => {
  it('writes whole naira plainly and kobo with two digits', () => {
    expect(nairaText(18_000_000)).toBe('180000');
    expect(nairaText(150_050)).toBe('1500.50');
    expect(nairaText(5)).toBe('0.05');
    expect(nairaText(0)).toBe('0');
  });
});
