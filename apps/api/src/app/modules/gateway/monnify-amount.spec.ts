import { monnifyDate, nairaToMinor } from './monnify-amount';

describe('nairaToMinor', () => {
  it.each([
    [5000, 500_000],
    ['4900.00', 490_000],
    ['4900.5', 490_050],
    [4900.5, 490_050],
    ['0.07', 7],
    [' 12 ', 1200],
    ['1000000.10', 100_000_010],
  ])('reads %j as %i kobo', (value, minor) => {
    expect(nairaToMinor(value)).toBe(minor);
  });

  it.each(['', 'abc', '-5', '1.234', '1e3', '1,000.00', 'NaN'])(
    'refuses %j',
    (value) => {
      expect(nairaToMinor(value)).toBeUndefined();
    }
  );

  it('does not drift on amounts a float cannot hold exactly', () => {
    expect(nairaToMinor('0.29')).toBe(29);
    expect(nairaToMinor(1.15)).toBe(115);
  });
});

describe('monnifyDate', () => {
  const fallback = new Date('2000-01-01T00:00:00Z');

  it('reads an ISO time as written', () => {
    expect(monnifyDate('2026-10-24T10:15:29Z', fallback).toISOString()).toBe(
      '2026-10-24T10:15:29.000Z'
    );
  });

  it('reads Monnify’s plain layouts as Lagos time', () => {
    expect(monnifyDate('2026-10-24 11:15:29.0', fallback).toISOString()).toBe(
      '2026-10-24T10:15:29.000Z'
    );
    expect(monnifyDate('12/10/2021 3:15:29 PM', fallback).toISOString()).toBe(
      '2021-10-12T14:15:29.000Z'
    );
    expect(monnifyDate('12/10/2021 12:05:00 AM', fallback).toISOString()).toBe(
      '2021-10-11T23:05:00.000Z'
    );
  });

  it('falls back when it cannot read the time', () => {
    expect(monnifyDate('yesterday', fallback)).toBe(fallback);
    expect(monnifyDate('', fallback)).toBe(fallback);
  });
});
