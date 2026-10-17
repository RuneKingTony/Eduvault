import { contract } from './contract';
import {
  PAYMENT_ALLOCATION_TWICE_MESSAGE,
  PAYMENT_AMOUNT_MESSAGE,
  PAYMENT_NO_ALLOCATION_MESSAGE,
  PAYMENT_PAYER_REQUIRED_MESSAGE,
  PAYMENT_PROOF,
  PAYMENT_REFERENCE_REQUIRED_MESSAGE,
  paymentListQuerySchema,
  paymentProviderReferenceUsedMessage,
  paymentReferenceUsedMessage,
  paymentSplitMismatchMessage,
  recordPaymentSchema,
} from './payments';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const other = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';

const body = {
  reference: 'TRF-20261007-K3Q7ZA',
  payerGuardianId: id,
  moneyAccountId: id,
  method: 'transfer',
  amountMinor: 30_000_000,
  paidOn: '2026-10-07',
  allocations: [{ studentId: id, amountMinor: 30_000_000 }],
};

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

describe('recordPaymentSchema', () => {
  it('accepts a payment from a guardian and trims the reference', () => {
    const parsed = recordPaymentSchema.parse({
      ...body,
      reference: '  TRF-20261007-K3Q7ZA ',
    });
    expect(parsed.reference).toBe('TRF-20261007-K3Q7ZA');
    expect(parsed.providerReference).toBeUndefined();
  });

  it('treats a blank provider reference as none', () => {
    const parsed = recordPaymentSchema.parse({
      ...body,
      providerReference: '   ',
    });
    expect(parsed.providerReference).toBeUndefined();
  });

  it('accepts someone else as the payer when a name is given', () => {
    const { payerGuardianId: _removed, ...rest } = body;
    expect(
      recordPaymentSchema.parse({ ...rest, payerName: ' Mrs Ojo ' }).payerName
    ).toBe('Mrs Ojo');
  });

  it('asks who paid when there is neither a guardian nor a name', () => {
    const { payerGuardianId: _removed, ...rest } = body;
    expect(messages(recordPaymentSchema.safeParse(rest))).toEqual([
      PAYMENT_PAYER_REQUIRED_MESSAGE,
    ]);
  });

  it('refuses a blank reference with the retry hint', () => {
    expect(
      messages(recordPaymentSchema.safeParse({ ...body, reference: '  ' }))
    ).toEqual([PAYMENT_REFERENCE_REQUIRED_MESSAGE]);
  });

  it('refuses a zero, negative or fractional amount', () => {
    for (const amountMinor of [0, -5, 10.5]) {
      expect(
        messages(recordPaymentSchema.safeParse({ ...body, amountMinor }))
      ).toEqual([PAYMENT_AMOUNT_MESSAGE]);
    }
  });

  it('refuses an empty split, a zero share and the same student twice', () => {
    expect(
      messages(recordPaymentSchema.safeParse({ ...body, allocations: [] }))
    ).toEqual([PAYMENT_NO_ALLOCATION_MESSAGE]);
    expect(
      messages(
        recordPaymentSchema.safeParse({
          ...body,
          allocations: [{ studentId: id, amountMinor: 0 }],
        })
      )
    ).toEqual([PAYMENT_AMOUNT_MESSAGE]);
    expect(
      messages(
        recordPaymentSchema.safeParse({
          ...body,
          allocations: [
            { studentId: id, amountMinor: 100 },
            { studentId: id, amountMinor: 200 },
          ],
        })
      )
    ).toEqual([PAYMENT_ALLOCATION_TWICE_MESSAGE]);
    expect(
      recordPaymentSchema.safeParse({
        ...body,
        allocations: [
          { studentId: id, amountMinor: 100 },
          { studentId: other, amountMinor: 200 },
        ],
      }).success
    ).toBe(true);
  });

  it('refuses a method outside cash, transfer and POS, and a bad date', () => {
    expect(
      recordPaymentSchema.safeParse({ ...body, method: 'gateway' }).success
    ).toBe(false);
    expect(
      recordPaymentSchema.safeParse({ ...body, paidOn: '07/10/2026' }).success
    ).toBe(false);
  });
});

describe('paymentListQuerySchema', () => {
  it('defaults to page 1 and 10 rows and takes a status and a search', () => {
    expect(paymentListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(
      paymentListQuerySchema.parse({ q: ' RCT ', status: 'void_pending' })
    ).toMatchObject({ q: 'RCT', status: 'void_pending' });
  });

  it('refuses an unknown status and a page below 1', () => {
    expect(paymentListQuerySchema.safeParse({ status: 'gone' }).success).toBe(
      false
    );
    expect(paymentListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('payment messages', () => {
  it('writes the split, reference and provider clashes in the PRD words', () => {
    expect(paymentSplitMismatchMessage(25_000_000, 30_000_000)).toBe(
      'Allocations add up to ₦250,000 but the payment is ₦300,000.'
    );
    expect(paymentReferenceUsedMessage('TRF-1', 'RCT-2026-00088')).toBe(
      'Reference TRF-1 is already used by RCT-2026-00088.'
    );
    expect(
      paymentProviderReferenceUsedMessage('GTB/FT/1', 'RCT-2026-00088')
    ).toBe('Provider reference GTB/FT/1 is already on RCT-2026-00088.');
  });

  it('keeps proofs to 10 MB of photos and PDFs', () => {
    expect(PAYMENT_PROOF.maxBytes).toBe(10_485_760);
    expect(PAYMENT_PROOF.types).toContain('application/pdf');
    expect(PAYMENT_PROOF.types).toContain('image/heic');
  });
});

describe('contract.payments', () => {
  it('serves the list, the sheet options, one receipt and the record route', () => {
    expect(contract.payments.list.path).toBe('/finance/payments');
    expect(contract.payments.recordingOptions.path).toBe(
      '/finance/payments/recording-options'
    );
    expect(contract.payments.get.path).toBe('/finance/payments/:id');
    expect(contract.payments.record.method).toBe('POST');
  });
});
