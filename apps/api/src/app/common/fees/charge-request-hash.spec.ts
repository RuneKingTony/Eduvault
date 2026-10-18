import { chargeRequestHash } from './charge-request-hash';

const ada = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const chidi = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const trips = 'a1111111-1111-4111-8111-111111111111';
const cards = 'b2222222-2222-4222-8222-222222222222';

const tripLine = {
  feeTypeId: trips,
  description: 'School trip',
  amountMinor: 1_500_000,
};
const cardLine = {
  feeTypeId: cards,
  description: 'ID card',
  amountMinor: 250_000,
};
const base = { studentId: ada, lines: [tripLine, cardLine] };

describe('chargeRequestHash', () => {
  it('is the same for the same input', () => {
    expect(chargeRequestHash(structuredClone(base))).toBe(
      chargeRequestHash(base)
    );
  });

  it('is a SHA-256 hex digest', () => {
    expect(chargeRequestHash(base)).toMatch(/^[\da-f]{64}$/);
  });

  it('changes with the student', () => {
    expect(chargeRequestHash({ ...base, studentId: chidi })).not.toBe(
      chargeRequestHash(base)
    );
  });

  it('changes with an amount, a description or a fee type', () => {
    const other = chargeRequestHash(base);
    const change = (patch: Partial<typeof tripLine>) =>
      chargeRequestHash({
        ...base,
        lines: [{ ...tripLine, ...patch }, cardLine],
      });
    expect(change({ amountMinor: 1_500_001 })).not.toBe(other);
    expect(change({ description: 'School trip 2' })).not.toBe(other);
    expect(change({ feeTypeId: cards })).not.toBe(other);
  });

  it('changes with the order of the lines', () => {
    expect(
      chargeRequestHash({ ...base, lines: base.lines.toReversed() })
    ).not.toBe(chargeRequestHash(base));
  });

  it('changes with the lines held', () => {
    expect(chargeRequestHash({ ...base, lines: [tripLine] })).not.toBe(
      chargeRequestHash(base)
    );
  });
});
