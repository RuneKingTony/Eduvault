import { saleRequestHash } from './sale-request-hash';

const ada = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const chidi = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const account = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';
const shirt = 'a1111111-1111-4111-8111-111111111111';
const tie = 'b2222222-2222-4222-8222-222222222222';

const base = {
  studentId: ada,
  method: 'cash',
  moneyAccountId: account,
  lines: [
    { itemId: shirt, quantity: 2 },
    { itemId: tie, quantity: 1 },
  ],
} as const;

describe('saleRequestHash', () => {
  // requestHash is stored on the sale, so changing the canonical form would turn replays of old references into 409s.
  it('is the SHA-256 of the canonical request, as stored on earlier sales', () => {
    expect(saleRequestHash(base)).toBe(
      '12c6718eb357a96659d088f4388d412eedbd30a5568e6d9eda929c4d88957125'
    );
  });

  it('is the same whatever order the lines come in', () => {
    expect(
      saleRequestHash({ ...base, lines: [...base.lines].toReversed() })
    ).toBe(saleRequestHash(base));
  });

  it('changes with the student', () => {
    expect(saleRequestHash({ ...base, studentId: chidi })).not.toBe(
      saleRequestHash(base)
    );
  });

  it('changes with a line, its quantity or the lines held', () => {
    const other = saleRequestHash(base);
    expect(
      saleRequestHash({
        ...base,
        lines: [{ itemId: shirt, quantity: 3 }, base.lines[1]],
      })
    ).not.toBe(other);
    expect(
      saleRequestHash({ ...base, lines: [{ itemId: shirt, quantity: 2 }] })
    ).not.toBe(other);
  });

  it('changes with the method and the account', () => {
    const other = saleRequestHash(base);
    expect(saleRequestHash({ ...base, method: 'pos' })).not.toBe(other);
    expect(saleRequestHash({ ...base, moneyAccountId: shirt })).not.toBe(other);
  });
});
