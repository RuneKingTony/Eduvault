import type { FeeType, LedgerAccount } from '@eduvault/api-contract';
import { feeTypeOrder } from './discount-sheet';
import { creditNoteAccounts } from './request-fields';

const account = (over: Partial<LedgerAccount>): LedgerAccount => ({
  id: 'a',
  code: 4010,
  name: 'Tuition',
  type: 'income',
  parentId: 'fee',
  systemKey: null,
  balanceMinor: 0,
  ...over,
});

describe('creditNoteAccounts', () => {
  it('puts 5000 Discounts given first, then the income categories by code, leaving out the fee income group and everything else', () => {
    const accounts = [
      account({ id: 'pta', code: 4020, name: 'PTA fee' }),
      account({
        id: 'group',
        code: 4000,
        name: 'Fee income',
        parentId: null,
        systemKey: 'fee_income',
      }),
      account({
        id: 'receivable',
        code: 1100,
        type: 'asset',
        name: 'Fees owed to the school',
        systemKey: 'fees_receivable',
      }),
      account({
        id: 'discounts',
        code: 5000,
        type: 'expense',
        name: 'Discounts given',
        systemKey: 'discounts_given',
      }),
      account({ id: 'tuition' }),
      account({
        id: 'bad-debt',
        code: 5100,
        type: 'expense',
        name: 'Bad debt',
        systemKey: 'bad_debt',
      }),
    ];
    expect(creditNoteAccounts(accounts).map((row) => row.id)).toEqual([
      'discounts',
      'tuition',
      'pta',
    ]);
  });
});

describe('feeTypeOrder', () => {
  it('lists Tuition first and then the rest by code', () => {
    const types: FeeType[] = [
      { id: 'dev', code: 4040, name: 'Development levy' },
      { id: 'pta', code: 4020, name: 'PTA fee' },
      { id: 'tuition', code: 4010, name: 'Tuition' },
    ];
    expect(feeTypeOrder(types).map((type) => type.id)).toEqual([
      'tuition',
      'pta',
      'dev',
    ]);
  });
});
