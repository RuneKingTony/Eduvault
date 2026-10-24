import {
  WALLET_AMOUNT_MESSAGE,
  walletSpendOverMessage,
} from '@eduvault/api-contract';
import { ADA_ID, TOBI_ID, portalWallet, walletChild } from '../../test-utils';
import { payAllTexts, payModel } from './pay-model';

const ada = (over = {}) =>
  walletChild({
    studentId: ADA_ID,
    name: 'Ada Okeke',
    owedMinor: 2_000_000,
    oldestUnpaidOn: '2026-09-07',
    ...over,
  });
const tobi = (over = {}) =>
  walletChild({
    studentId: TOBI_ID,
    name: 'Tobi Okeke',
    owedMinor: 1_500_000,
    oldestUnpaidOn: '2026-03-01',
    ...over,
  });

const walletOf = (freeMinor: number, children = [ada(), tobi()]) =>
  portalWallet({ freeMinor, balanceMinor: freeMinor, children });

describe('payModel', () => {
  it('caps each child at what they owe and lists the child owing longest first', () => {
    const model = payModel(walletOf(10_000_000), {});
    expect(model.rows.map((row) => row.name)).toEqual([
      'Tobi Okeke',
      'Ada Okeke',
    ]);
    expect(model.rows.map((row) => row.capMinor)).toEqual([
      1_500_000, 2_000_000,
    ]);
  });

  it('caps a child at their set-aside money plus the free money', () => {
    const model = payModel(
      walletOf(500_000, [
        ada({ owedMinor: 9_000_000, earmarkMinor: 1_000_000 }),
      ]),
      {}
    );
    expect(model.rows[0]?.capMinor).toBe(1_500_000);
  });

  it('reads zero for a child who owes nothing and for an empty wallet', () => {
    const model = payModel(walletOf(0, [ada({ owedMinor: 0 })]), {});
    expect(model.rows[0]).toMatchObject({
      capMinor: 0,
      amountMinor: 0,
      issue: null,
    });
    expect(model.lines).toEqual([]);
    expect(model.totalMinor).toBe(0);
  });

  it('uses set-aside money first, so free money is left for the next child', () => {
    const wallet = walletOf(1_000_000, [
      tobi({ earmarkMinor: 1_500_000 }),
      ada(),
    ]);
    const model = payModel(wallet, { [TOBI_ID]: '15000', [ADA_ID]: '10000' });
    expect(model.rows.map((row) => row.capMinor)).toEqual([
      1_500_000, 1_000_000,
    ]);
    expect(model.issue).toBeNull();
    expect(model.lines).toEqual([
      { studentId: TOBI_ID, amountMinor: 1_500_000 },
      { studentId: ADA_ID, amountMinor: 1_000_000 },
    ]);
    expect(model.totalMinor).toBe(2_500_000);
  });

  it('does not count the same free money for two children', () => {
    const model = payModel(walletOf(2_000_000), {
      [TOBI_ID]: '15000',
      [ADA_ID]: '10000',
    });
    expect(model.rows.map((row) => row.capMinor)).toEqual([1_500_000, 500_000]);
    expect(model.rows[1]?.issue).toBe(
      walletSpendOverMessage('Ada Okeke', 500_000)
    );
    expect(model.lines).toEqual([
      { studentId: TOBI_ID, amountMinor: 1_500_000 },
    ]);
  });

  it('names the limit for an entry over the cap, and says nothing can be used at zero', () => {
    const over = payModel(walletOf(10_000_000), { [ADA_ID]: '20000.01' });
    expect(over.issue).toBe(walletSpendOverMessage('Ada Okeke', 2_000_000));
    expect(over.lines).toEqual([]);
    const empty = payModel(walletOf(0), { [ADA_ID]: '1' });
    expect(empty.issue).toBe(walletSpendOverMessage('Ada Okeke', 0));
  });

  it('refuses text that is not an amount, and treats blank as no line', () => {
    expect(payModel(walletOf(10_000_000), { [ADA_ID]: 'lots' }).issue).toBe(
      WALLET_AMOUNT_MESSAGE
    );
    const blank = payModel(walletOf(10_000_000), { [ADA_ID]: '  ' });
    expect(blank.issue).toBeNull();
    expect(blank.lines).toEqual([]);
  });

  it('reads kobo exactly', () => {
    const model = payModel(walletOf(10_000_000), { [ADA_ID]: '1,250.50' });
    expect(model.lines).toEqual([{ studentId: ADA_ID, amountMinor: 125_050 }]);
  });
});

describe('payAllTexts', () => {
  it('fills the child owing longest first and gives the next what is left', () => {
    expect(payAllTexts(walletOf(2_000_000))).toEqual({
      [TOBI_ID]: '15000',
      [ADA_ID]: '5000',
    });
  });

  it('fills nothing for an empty wallet', () => {
    expect(payAllTexts(walletOf(0))).toEqual({});
  });
});
