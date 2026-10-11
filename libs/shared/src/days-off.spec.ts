import type { DayOff } from './calendar';
import { dayOffRows, daysOffSubline } from './days-off';

const dayOff = (overrides: Partial<DayOff> = {}): DayOff => ({
  kind: 'holiday',
  name: 'Founders day',
  start: '2026-10-29',
  end: '2026-10-29',
  days: 1,
  ...overrides,
});

describe('daysOffSubline', () => {
  it('writes a run of holiday days for staff and for the portal', () => {
    const run = dayOff({ start: '2026-10-29', end: '2026-10-30', days: 2 });
    expect(daysOffSubline(run, 'staff')).toBe('Thu – Fri · 2 days off');
    expect(daysOffSubline(run, 'portal')).toBe('Thu – Fri · no school');
  });

  it('writes a single day', () => {
    const one = dayOff({ start: '2026-10-01', end: '2026-10-01', days: 1 });
    expect(daysOffSubline(one, 'staff')).toBe('Thu · 1 day off');
    expect(daysOffSubline(one, 'portal')).toBe('Thu · no school');
  });

  it('says when a break ends', () => {
    const christmas = dayOff({
      kind: 'break',
      name: 'Christmas break',
      start: '2026-12-12',
      end: '2027-01-03',
      days: 15,
      resume: '2027-01-04',
    });
    expect(daysOffSubline(christmas, 'staff')).toBe('Resumes 4 Jan 2027');
    expect(daysOffSubline(christmas, 'portal')).toBe(
      'School resumes 4 Jan 2027'
    );
  });
});

describe('dayOffRows', () => {
  it('describes each day off for the row, highlighting the first', () => {
    const rows = dayOffRows(
      [
        dayOff({ start: '2026-10-29', end: '2026-10-29' }),
        dayOff({ name: 'Boxing day', start: '2026-12-26', end: '2026-12-26' }),
      ],
      'portal',
      '2026-10-26'
    );
    expect(rows).toEqual([
      {
        key: 'Founders day-2026-10-29',
        month: 'Oct',
        day: 29,
        name: 'Founders day',
        subline: 'Thu · no school',
        relative: 'in 3 days',
        highlighted: true,
      },
      expect.objectContaining({
        key: 'Boxing day-2026-12-26',
        month: 'Dec',
        day: 26,
        highlighted: false,
      }),
    ]);
  });

  it('keeps a recurring name apart across years', () => {
    const rows = dayOffRows(
      [
        dayOff({ name: 'Christmas', start: '2026-12-25', end: '2026-12-25' }),
        dayOff({ name: 'Christmas', start: '2027-12-25', end: '2027-12-25' }),
      ],
      'staff',
      '2026-10-26'
    );
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });
});
