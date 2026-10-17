import { BALANCE_FILTERS } from '@eduvault/api-contract';
import { balanceFilterRule } from './balance-filter';

describe('balanceFilterRule', () => {
  it('Owing is any lifecycle with a balance above zero', () => {
    expect(balanceFilterRule('owing')).toEqual({
      balance: 'owing',
      lives: null,
    });
  });

  it('Owing: current students keeps Active and Inactive', () => {
    expect(balanceFilterRule('owing_current')).toEqual({
      balance: 'owing',
      lives: ['active', 'inactive'],
    });
  });

  it('Owing: left or graduated keeps Left and Graduated', () => {
    expect(balanceFilterRule('owing_gone')).toEqual({
      balance: 'owing',
      lives: ['left', 'graduated'],
    });
  });

  it('Paid up is a balance of zero or credit, and Everyone filters nothing', () => {
    expect(balanceFilterRule('paid')).toEqual({
      balance: 'settled',
      lives: null,
    });
    expect(balanceFilterRule('all')).toEqual({ balance: 'any', lives: null });
  });

  it('never lets Active or Inactive and Left or Graduated overlap', () => {
    const current = balanceFilterRule('owing_current').lives ?? [];
    const gone = balanceFilterRule('owing_gone').lives ?? [];
    expect(current.filter((life) => gone.includes(life))).toEqual([]);
    expect(BALANCE_FILTERS).toHaveLength(5);
  });
});
