import { dayOff } from '../../test-dashboard';
import { daysOffSubline } from './days-off-list';

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
