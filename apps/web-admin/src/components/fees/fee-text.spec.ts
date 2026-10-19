import {
  copiedFeesToast,
  copyFeesBody,
  optInsToast,
  retiredTip,
} from './fee-text';

const SOURCE = 'Third term, 2026/2027';

describe('copyFeesBody', () => {
  it('says fees for many and fee for one', () => {
    expect(copyFeesBody(12, SOURCE)).toBe(
      'Copies the 12 active fees of Third term, 2026/2027, with the same amounts, campuses and rules. Retired fees stay behind. Change any amount afterwards.'
    );
    expect(copyFeesBody(1, SOURCE)).toContain('Copies the 1 active fee of ');
  });
});

describe('copiedFeesToast', () => {
  it('names the count and the source term in the plural', () => {
    expect(copiedFeesToast(12, SOURCE)).toBe(
      'Copied 12 fees from Third term, 2026/2027. They apply from the next round of charges.'
    );
  });

  it('uses the singular fee for one fee', () => {
    expect(copiedFeesToast(1, SOURCE)).toBe(
      'Copied 1 fee from Third term, 2026/2027. They apply from the next round of charges.'
    );
  });
});

describe('retiredTip', () => {
  it('names the Lagos day, so a line retired at 00:30 there is not dated the day before', () => {
    expect(retiredTip({ retiredAt: '2026-10-05T23:30:00.000Z' })).toBe(
      'Retired 6 Oct 2026. Kept for history.'
    );
    expect(retiredTip({ retiredAt: '2026-10-06T09:00:00.000Z' })).toBe(
      'Retired 6 Oct 2026. Kept for history.'
    );
  });
});

describe('optInsToast', () => {
  it('says takes for one student and take for many', () => {
    expect(optInsToast('School bus', true, { selected: 1, changed: 1 })).toBe(
      '1 student now takes School bus from the next round of charges.'
    );
    expect(optInsToast('School bus', true, { selected: 2, changed: 2 })).toBe(
      '2 students now take School bus from the next round of charges.'
    );
    expect(optInsToast('School bus', false, { selected: 1, changed: 1 })).toBe(
      '1 student no longer takes School bus.'
    );
    expect(optInsToast('School bus', false, { selected: 3, changed: 2 })).toBe(
      '3 students no longer take School bus.'
    );
  });

  it('says nothing changed when no row moved', () => {
    expect(optInsToast('School bus', true, { selected: 2, changed: 0 })).toBe(
      'No change: the selected students already take School bus.'
    );
    expect(optInsToast('School bus', false, { selected: 2, changed: 0 })).toBe(
      "No change: the selected students already don't take School bus."
    );
  });
});
