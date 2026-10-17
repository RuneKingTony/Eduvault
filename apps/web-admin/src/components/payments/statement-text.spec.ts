import {
  balanceTile,
  creditCallout,
  entriesFooter,
  familyDescription,
  familyTotalSubline,
  isOwingRow,
  lifeSuffix,
} from './statement-text';

describe('balanceTile', () => {
  it('is Owing with the balance, Extra paid with the credit, and Owing: Nothing at zero', () => {
    expect(balanceTile(6_000_000, 'NGN')).toEqual({
      label: 'Owing',
      value: '₦60,000',
    });
    expect(balanceTile(-500_000, 'NGN')).toEqual({
      label: 'Extra paid',
      value: '₦5,000',
    });
    expect(balanceTile(0, 'NGN')).toEqual({ label: 'Owing', value: 'Nothing' });
  });
});

describe('entriesFooter', () => {
  it('reads Owing now, Extra paid or Nothing owing', () => {
    expect(entriesFooter(2_000_000, 'NGN')).toEqual({
      label: 'Owing now',
      value: '₦20,000',
    });
    expect(entriesFooter(-500_000, 'NGN')).toEqual({
      label: 'Extra paid',
      value: '₦5,000',
    });
    expect(entriesFooter(0, 'NGN')).toEqual({
      label: 'Nothing owing',
      value: '₦0',
    });
  });
});

describe('creditCallout', () => {
  it('says how much was paid in extra and what happens to it', () => {
    expect(creditCallout(500_000, 'NGN')).toBe(
      '₦5,000 was paid in extra. It is taken off the next fees automatically, or you can pay it back.'
    );
  });
});

describe('familyTotalSubline', () => {
  it('adds the credit kept separately', () => {
    expect(familyTotalSubline(8_000_000, 500_000, 'NGN')).toBe(
      'Owed across all children · ₦5,000 extra paid kept separately'
    );
  });

  it('is plain when nobody holds credit, and Nothing owed at zero', () => {
    expect(familyTotalSubline(8_000_000, 0, 'NGN')).toBe(
      'Owed across all children'
    );
    expect(familyTotalSubline(0, 0, 'NGN')).toBe('Nothing owed');
    expect(familyTotalSubline(0, 300_000, 'NGN')).toBe(
      'Nothing owed · ₦3,000 extra paid kept separately'
    );
  });

  it('describes the family view', () => {
    expect(familyDescription(3)).toBe(
      '3 children. Each keeps their own account; this view combines them.'
    );
  });
});

describe('row helpers', () => {
  it('marks the rows that leave more owing', () => {
    expect(
      (['charged', 'paid', 'reduced', 'cancelled', 'refunded'] as const).map(
        (status) => isOwingRow(status)
      )
    ).toEqual([true, false, false, true, true]);
  });

  it('adds the lifecycle after the admission number unless the student is active', () => {
    expect(lifeSuffix('active')).toBe('');
    expect(lifeSuffix('left')).toBe(' · left');
    expect(lifeSuffix('inactive')).toBe(' · inactive');
    expect(lifeSuffix('graduated')).toBe(' · graduated');
  });
});
