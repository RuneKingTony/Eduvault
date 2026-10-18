import { copiedFeesToast, copyFeesBody } from './fee-text';

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
