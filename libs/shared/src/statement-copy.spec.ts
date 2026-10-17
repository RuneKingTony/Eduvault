import {
  balanceBadgeVariant,
  balanceTile,
  balanceTone,
  creditCallout,
  entriesFooter,
  familyDescription,
  familyTotalSubline,
  feesStat,
  feesTile,
  portalBalanceLine,
  statementCallout,
  statementTiles,
  studentDetail,
} from './statement-copy';

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
  it('offers to pay it back to staff', () => {
    expect(creditCallout(500_000, 'NGN', { canPayBack: true })).toBe(
      '₦5,000 was paid in extra. It is taken off the next fees automatically, or you can pay it back.'
    );
  });

  it('ends at automatically for the portal, which cannot pay it back', () => {
    expect(creditCallout(500_000, 'NGN', { canPayBack: false })).toBe(
      '₦5,000 was paid in extra. It is taken off the next fees automatically.'
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
});

describe('familyDescription', () => {
  it('describes the family view', () => {
    expect(familyDescription(3)).toBe(
      '3 children. Each keeps their own account; this view combines them.'
    );
  });
});

describe('portalBalanceLine', () => {
  it('reads owed, in credit or Paid up', () => {
    expect(portalBalanceLine(6_000_000, 'NGN')).toBe('₦60,000 owed');
    expect(portalBalanceLine(-500_000, 'NGN')).toBe('₦5,000 in credit');
    expect(portalBalanceLine(0, 'NGN')).toBe('Paid up');
  });
});

describe('feesStat', () => {
  it('reads Owing with the amount and Still to pay when owing', () => {
    expect(feesStat(6_000_000, 'NGN')).toEqual({
      label: 'Owing',
      value: '₦60,000',
      sub: 'Still to pay',
    });
  });

  it('reads School fees, Paid up and the extra when in credit', () => {
    expect(feesStat(-500_000, 'NGN')).toEqual({
      label: 'School fees',
      value: 'Paid up',
      sub: '₦5,000 extra',
    });
  });

  it('reads School fees, Paid up and Nothing owed at zero', () => {
    expect(feesStat(0, 'NGN')).toEqual({
      label: 'School fees',
      value: 'Paid up',
      sub: 'Nothing owed',
    });
  });
});

describe('feesTile', () => {
  it('shows the amount as Owed, Paid up with what was paid ahead, or Paid up with Nothing owed', () => {
    expect(feesTile(6_000_000, 'NGN')).toEqual({
      value: '₦60,000',
      sub: 'Owed',
    });
    expect(feesTile(-500_000, 'NGN')).toEqual({
      value: 'Paid up',
      sub: '₦5,000 paid ahead',
    });
    expect(feesTile(0, 'NGN')).toEqual({
      value: 'Paid up',
      sub: 'Nothing owed',
    });
  });
});

describe('statementTiles', () => {
  const totals = {
    balanceMinor: 5_100_000,
    paidMinor: 16_900_000,
    reducedMinor: 0,
    totalMinor: 22_000_000,
  };

  it('shows the balance, Paid and Total, with Reduced only when something was reduced', () => {
    expect(statementTiles(totals, 'NGN')).toEqual([
      { label: 'Owing', value: '₦51,000' },
      { label: 'Paid', value: '₦169,000' },
      { label: 'Total', value: '₦220,000' },
    ]);
    expect(
      statementTiles({ ...totals, reducedMinor: 1_100_000 }, 'NGN').map(
        (tile) => tile.label
      )
    ).toEqual(['Owing', 'Paid', 'Reduced', 'Total']);
  });

  it('turns the first tile into Extra paid when in credit', () => {
    expect(
      statementTiles({ ...totals, balanceMinor: -500_000 }, 'NGN')[0]
    ).toEqual({ label: 'Extra paid', value: '₦5,000' });
  });
});

describe('statementCallout', () => {
  it('exists only when the student is in credit', () => {
    expect(statementCallout(-500_000, 'NGN', { canPayBack: false })).toEqual({
      text: '₦5,000 was paid in extra. It is taken off the next fees automatically.',
    });
    expect(statementCallout(0, 'NGN', { canPayBack: true })).toBeUndefined();
    expect(statementCallout(100, 'NGN', { canPayBack: true })).toBeUndefined();
  });
});

describe('studentDetail', () => {
  const student = {
    admissionNumber: 'GF-0123',
    className: 'JSS 1 Gold',
    campusName: 'Lekki',
    archived: false,
  };

  it('joins admission number, class and campus, marking an archived student', () => {
    expect(studentDetail(student)).toBe('GF-0123 · JSS 1 Gold · Lekki');
    expect(studentDetail({ ...student, archived: true })).toBe(
      'GF-0123 · JSS 1 Gold · Lekki · archived'
    );
  });

  it('shows a dash for a student with no class', () => {
    expect(studentDetail({ ...student, className: null })).toBe(
      'GF-0123 · — · Lekki'
    );
  });
});

describe('balanceTone', () => {
  it('is destructive only while something is owed', () => {
    expect(balanceTone(6_000_000)).toBe('destructive');
    expect(balanceTone(0)).toBe('success');
    expect(balanceTone(-500_000)).toBe('success');
  });
});

describe('balanceBadgeVariant', () => {
  it('is destructive when owing, secondary in credit and success when paid up', () => {
    expect(balanceBadgeVariant(6_000_000)).toBe('destructive');
    expect(balanceBadgeVariant(-500_000)).toBe('secondary');
    expect(balanceBadgeVariant(0)).toBe('success');
  });
});
