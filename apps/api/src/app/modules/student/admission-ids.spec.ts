import { formatAdmissionNumber, formatStudentUsername } from './admission-ids';

describe('formatAdmissionNumber', () => {
  it('pads to four digits and keeps growing past them', () => {
    expect(formatAdmissionNumber('GF', 1)).toBe('GF-0001');
    expect(formatAdmissionNumber('GF', 123)).toBe('GF-0123');
    expect(formatAdmissionNumber('GF', 9999)).toBe('GF-9999');
    expect(formatAdmissionNumber('GF', 10_000)).toBe('GF-10000');
  });
});

describe('formatStudentUsername', () => {
  it('uses the slug and the same padded number', () => {
    expect(formatStudentUsername('greenfield', 123)).toBe('greenfield-0123');
    expect(formatStudentUsername('greenfield', 12_345)).toBe(
      'greenfield-12345'
    );
  });
});
