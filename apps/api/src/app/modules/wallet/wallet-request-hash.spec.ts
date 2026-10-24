import { topUpRequestHash } from './wallet-request-hash';

const wallet = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const otherWallet = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const account = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';

const topUp = {
  moneyAccountId: account,
  method: 'cash',
  amountMinor: 5_000_000,
  receivedOn: '2026-10-23',
  depositorName: 'Mrs Ojo',
} as const;

describe('topUpRequestHash', () => {
  // The hash is stored on the top-up, so changing the canonical form would turn replays of old references into 409s.
  it('is the SHA-256 of the canonical request, as stored on earlier top-ups', () => {
    expect(topUpRequestHash(wallet, topUp)).toBe(
      '457dd310f10dd838487d600894b571c6a4239a704f9fccfd21674bb770d55e50'
    );
  });

  it('ignores spaces around the depositor and treats none as null', () => {
    expect(
      topUpRequestHash(wallet, { ...topUp, depositorName: '  Mrs Ojo ' })
    ).toBe(topUpRequestHash(wallet, topUp));
    expect(
      topUpRequestHash(wallet, { ...topUp, depositorName: undefined })
    ).not.toBe(topUpRequestHash(wallet, topUp));
  });

  it.each([
    ['wallet', () => topUpRequestHash(otherWallet, topUp)],
    [
      'amount',
      () => topUpRequestHash(wallet, { ...topUp, amountMinor: 5_000_001 }),
    ],
    ['method', () => topUpRequestHash(wallet, { ...topUp, method: 'pos' })],
    [
      'date',
      () => topUpRequestHash(wallet, { ...topUp, receivedOn: '2026-10-22' }),
    ],
    [
      'money account',
      () => topUpRequestHash(wallet, { ...topUp, moneyAccountId: wallet }),
    ],
  ])('changes when the %s changes', (_field, changed) => {
    expect(changed()).not.toBe(topUpRequestHash(wallet, topUp));
  });
});
