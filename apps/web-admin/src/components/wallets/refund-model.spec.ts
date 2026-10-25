import {
  PAYMENT_PROOF_TYPE_MESSAGE,
  PAYMENT_REFERENCE_REQUIRED_MESSAGE,
  WALLET_AMOUNT_MESSAGE,
  WALLET_REFUND_EMAIL_MESSAGE,
  WALLET_REFUND_PROOF_REQUIRED_MESSAGE,
  WALLET_REFUND_REASON_MESSAGE,
  walletRefundOverMessage,
} from '@eduvault/api-contract';
import { BANK, refundOptions } from '../../test-wallets';
import {
  confirmDetails,
  initialState,
  toRequest,
  validate,
  type RefundState,
} from './refund-model';

const FREE = 4_000_000;

const filled = (over: Partial<RefundState> = {}): RefundState => ({
  ...initialState(refundOptions()),
  amount: '15,000',
  email: 'ngozi@example.com',
  reason: 'Paid twice',
  ...over,
});

const pdf = new File(['x'], 'email.pdf', { type: 'application/pdf' });
const attached = { file: pdf, uploaded: false };

describe('initialState', () => {
  it('starts on the first bank account with a fresh WRQ reference', () => {
    const state = initialState(refundOptions());
    expect(state).toMatchObject({
      accountId: BANK,
      amount: '',
      email: '',
      reason: '',
    });
    expect(state.reference).toMatch(/^WRQ-\d{8}-[A-Z2-7]{6}$/);
  });

  it('has no account to start on when the school has no bank account', () => {
    expect(initialState(refundOptions({ accounts: [] })).accountId).toBe('');
  });
});

describe('validate', () => {
  it('passes a complete request within the free money', () => {
    expect(validate(filled(), attached, FREE)).toEqual({});
  });

  it('asks for every missing field once', () => {
    expect(
      validate(
        filled({ amount: '', email: '', reason: ' ', reference: ' ' }),
        { file: undefined, uploaded: false },
        FREE
      )
    ).toEqual({
      amount: WALLET_AMOUNT_MESSAGE,
      email: WALLET_REFUND_EMAIL_MESSAGE,
      file: WALLET_REFUND_PROOF_REQUIRED_MESSAGE,
      reason: WALLET_REFUND_REASON_MESSAGE,
      reference: PAYMENT_REFERENCE_REQUIRED_MESSAGE,
    });
  });

  it('refuses more than the free money, naming the most', () => {
    expect(
      validate(filled({ amount: '40,000.01' }), attached, FREE).amount
    ).toBe(walletRefundOverMessage(FREE));
    expect(validate(filled({ amount: '40,000' }), attached, FREE).amount).toBe(
      undefined
    );
  });

  it('refuses an amount when nothing is free', () => {
    expect(validate(filled(), attached, -500_000).amount).toBe(
      walletRefundOverMessage(-500_000)
    );
  });

  it('refuses an email address without a domain', () => {
    expect(validate(filled({ email: 'ngozi@' }), attached, FREE).email).toBe(
      WALLET_REFUND_EMAIL_MESSAGE
    );
  });

  it('accepts an email already uploaded, and refuses a file that is not a photo, screenshot or PDF', () => {
    expect(
      validate(filled(), { file: undefined, uploaded: true }, FREE).file
    ).toBeUndefined();
    expect(
      validate(
        filled(),
        {
          file: new File(['x'], 'a.txt', { type: 'text/plain' }),
          uploaded: false,
        },
        FREE
      ).file
    ).toBe(PAYMENT_PROOF_TYPE_MESSAGE);
  });
});

describe('toRequest', () => {
  it('sends trimmed text, the amount in kobo and the uploaded file', () => {
    const state = filled({
      amount: '15,000',
      email: ' ngozi@example.com ',
      reason: ' Paid twice ',
      reference: ' WRQ-20261026-ABCDEF ',
    });
    expect(toRequest(state, 'file-1')).toEqual({
      reference: 'WRQ-20261026-ABCDEF',
      moneyAccountId: BANK,
      amountMinor: 1_500_000,
      parentEmail: 'ngozi@example.com',
      reason: 'Paid twice',
      proofFileId: 'file-1',
    });
  });
});

describe('confirmDetails', () => {
  it('lists the family, the amount with kobo, the account and the email', () => {
    expect(confirmDetails(refundOptions(), filled(), 'Ngozi Okeke')).toEqual([
      { label: 'Wallet', value: 'Ngozi Okeke' },
      { label: 'Amount', value: '₦15,000.00' },
      { label: 'Paid from', value: 'GTBank current · ending 4417' },
      { label: 'Parent’s email', value: 'ngozi@example.com' },
    ]);
  });
});
