import { parseAdjustmentsSearch, tabOf } from './adjustments-search';

describe('parseAdjustmentsSearch', () => {
  it('keeps a tab other than the default, a page above one and the new flag', () => {
    expect(
      parseAdjustmentsSearch({ tab: 'discounts', page: '2', new: 1 })
    ).toMatchObject({ tab: 'discounts', page: 2, new: 1 });
  });

  it('drops the default tab, unknown values and page one', () => {
    expect(
      parseAdjustmentsSearch({
        tab: 'corrections',
        page: 1,
        new: 0,
        kind: 'gift',
      })
    ).toEqual({
      tab: undefined,
      page: undefined,
      new: undefined,
      kind: undefined,
      student: undefined,
      amount: undefined,
    });
    expect(parseAdjustmentsSearch({ tab: 'gone' }).tab).toBeUndefined();
  });

  it('carries the prefill of "Pay the extra back": a kind, a student and an amount in minor units', () => {
    expect(
      parseAdjustmentsSearch({
        new: '1',
        kind: 'refund',
        student: 'abc',
        amount: '500000',
      })
    ).toMatchObject({
      new: 1,
      kind: 'refund',
      student: 'abc',
      amount: 500_000,
    });
    expect(parseAdjustmentsSearch({ amount: '-5' }).amount).toBeUndefined();
    expect(parseAdjustmentsSearch({ amount: '1.5' }).amount).toBeUndefined();
  });
});

describe('tabOf', () => {
  it('defaults to the corrections tab', () => {
    expect(tabOf({})).toBe('corrections');
    expect(tabOf({ tab: 'voids' })).toBe('voids');
  });
});
