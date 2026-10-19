import { discountRow } from '../../test-approvals';
import {
  approvedTip,
  discountBadge,
  discountStatus,
  discountTerms,
  isEnded,
} from './adjustment-text';

describe('approvedTip', () => {
  it('tips who approved', () => {
    expect(approvedTip('Funmi Adeyemi')).toBe('Approved by Funmi Adeyemi');
    expect(approvedTip(null)).toBeUndefined();
  });
});

describe('discountBadge', () => {
  it('names the fee type in lower case, the whole charge, or a fixed amount', () => {
    expect(discountBadge(discountRow({ value: 50 }), 'NGN')).toBe(
      '50% tuition'
    );
    expect(discountBadge(discountRow({ feeType: null, value: 5 }), 'NGN')).toBe(
      '5% charge'
    );
    expect(
      discountBadge(discountRow({ kind: 'fixed', value: 1_500_000 }), 'NGN')
    ).toBe('₦15,000 off');
  });
});

describe('discountTerms and discountStatus', () => {
  it('reads "onward" with no end and "to" with one', () => {
    expect(discountTerms(discountRow({ toTerm: null }))).toBe(
      'Second term, 2026/2027 onward'
    );
    expect(discountTerms(discountRow())).toBe(
      'Second term, 2026/2027 to Third term, 2026/2027'
    );
  });

  it('calls a stopped discount Ended and the rest by their status', () => {
    const ended = discountRow({
      status: 'approved',
      endedAt: '2026-10-20T09:00:00.000Z',
    });
    expect(isEnded(ended)).toBe(true);
    expect(discountStatus(ended)).toBe('Ended');
    expect(discountStatus(discountRow())).toBe('Waiting');
    expect(discountStatus(discountRow({ status: 'rejected' }))).toBe(
      'Declined'
    );
    expect(discountStatus(discountRow({ status: 'approved' }))).toBe(
      'Approved'
    );
  });
});
