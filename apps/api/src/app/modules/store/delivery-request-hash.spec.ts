import type { RecordDelivery } from '@eduvault/api-contract';
import { deliveryRequestHash } from './delivery-request-hash';

const shirt = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const tie = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const campus = '7c9a0b3d-1f2e-4a5b-8c6d-9e0f1a2b3c4d';
const account = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';

const base: RecordDelivery = {
  reference: 'DEL-REQ-20261007-1a2b3c4d',
  campusId: campus,
  supplierName: 'Adebayo Uniforms Ltd',
  moneyAccountId: account,
  isOpening: undefined,
  receivedOn: undefined,
  lines: [
    { itemId: shirt, quantity: 10, unitCostMinor: 350_000 },
    { itemId: tie, quantity: 4, unitCostMinor: 120_000 },
  ],
};

const hashOf = (change: Partial<RecordDelivery> = {}) =>
  deliveryRequestHash({ ...base, ...change });

describe('deliveryRequestHash', () => {
  // requestHash is stored on the delivery, so changing the canonical form would turn replays of old references into 409s.
  it('is the SHA-256 of the canonical request, as stored on earlier deliveries', () => {
    expect(hashOf()).toBe(
      '95c2285fea5d2afacd9cfa194c3cd443db19c7045e8927ac0dc43ddce9b5a6d6'
    );
  });

  it('ignores the order of the lines', () => {
    expect(hashOf({ lines: base.lines.toReversed() })).toBe(hashOf());
  });

  it('ignores the reference, which is the key and not a business field', () => {
    expect(hashOf({ reference: 'DEL-REQ-20261008-ffffffff' })).toBe(hashOf());
  });

  it('ignores spacing in the supplier name', () => {
    expect(hashOf({ supplierName: '  Adebayo   Uniforms Ltd ' })).toBe(
      hashOf()
    );
  });

  it('treats an omitted opening flag as false', () => {
    expect(hashOf({ isOpening: false })).toBe(hashOf());
    expect(hashOf({ isOpening: true })).not.toBe(hashOf());
  });

  it('keeps an omitted date apart from a given one', () => {
    expect(hashOf({ receivedOn: '2026-10-07' })).not.toBe(hashOf());
  });

  it.each<[string, Partial<RecordDelivery>]>([
    ['campus', { campusId: account }],
    ['supplier', { supplierName: 'Other Ltd' }],
    ['account', { moneyAccountId: campus }],
    ['no account', { moneyAccountId: undefined }],
    [
      'quantity',
      { lines: [{ ...base.lines[0]!, quantity: 11 }, base.lines[1]!] },
    ],
    [
      'unit cost',
      { lines: [{ ...base.lines[0]!, unitCostMinor: 1 }, base.lines[1]!] },
    ],
    [
      'item',
      { lines: [{ ...base.lines[0]!, itemId: campus }, base.lines[1]!] },
    ],
    ['line count', { lines: [base.lines[0]!] }],
  ])('changes with the %s', (_name, change) => {
    expect(hashOf(change)).not.toBe(hashOf());
  });
});
