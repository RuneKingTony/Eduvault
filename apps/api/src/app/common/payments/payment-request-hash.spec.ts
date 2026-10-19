import type { RecordPayment } from '@eduvault/api-contract';
import { paymentRequestHash } from './payment-request-hash';

const ada = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const chidi = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const account = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';

const base: RecordPayment = {
  reference: 'TRF-20261007-K3Q7ZA',
  payerGuardianId: ada,
  payerName: undefined,
  moneyAccountId: account,
  method: 'transfer',
  providerReference: undefined,
  proofFileId: chidi,
  amountMinor: 30_000_000,
  paidOn: '2026-10-07',
  allocations: [
    { studentId: ada, amountMinor: 20_000_000 },
    { studentId: chidi, amountMinor: 10_000_000 },
  ],
};

const hashOf = (change: Partial<RecordPayment> = {}) =>
  paymentRequestHash({ ...base, ...change });

describe('paymentRequestHash', () => {
  // requestHash is stored on the payment, so changing the canonical form would turn replays of old references into 409s.
  it('is the SHA-256 of the canonical request, as stored on earlier payments', () => {
    expect(hashOf()).toBe(
      'e40be9d20b002aba8f6fb8e2bd50ebc9a1814a29ce12a6e88a6a30a7adfb1615'
    );
  });

  it('ignores the order of the allocations', () => {
    expect(hashOf({ allocations: base.allocations.toReversed() })).toBe(
      hashOf()
    );
  });

  it('ignores the reference, which is the key and not a business field', () => {
    expect(hashOf({ reference: 'TRF-20261007-ZZZZZZ' })).toBe(hashOf());
  });

  it('ignores spacing around the payer name', () => {
    expect(hashOf({ payerName: ' Mrs Ojo ', payerGuardianId: undefined })).toBe(
      hashOf({ payerName: 'Mrs Ojo', payerGuardianId: undefined })
    );
  });

  it('ignores the proof and the provider reference, which a retry may change', () => {
    expect(hashOf({ proofFileId: undefined })).toBe(hashOf());
    expect(hashOf({ proofFileId: ada })).toBe(hashOf());
    expect(hashOf({ providerReference: 'GTB/1' })).toBe(hashOf());
  });

  it.each<[string, Partial<RecordPayment>]>([
    ['amount', { amountMinor: 30_000_001 }],
    ['date', { paidOn: '2026-10-06' }],
    ['method', { method: 'cash' }],
    ['account', { moneyAccountId: ada }],
    ['payer', { payerGuardianId: chidi }],
    [
      'allocation amount',
      {
        allocations: [
          { studentId: ada, amountMinor: 10_000_000 },
          { studentId: chidi, amountMinor: 20_000_000 },
        ],
      },
    ],
    [
      'allocated student',
      {
        allocations: [
          { studentId: ada, amountMinor: 20_000_000 },
          { studentId: account, amountMinor: 10_000_000 },
        ],
      },
    ],
  ])('changes with the %s', (_name, change) => {
    expect(hashOf(change)).not.toBe(hashOf());
  });
});
