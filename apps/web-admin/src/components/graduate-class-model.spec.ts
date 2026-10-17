import { currentCalendar } from '../test-calendar';
import {
  byLastName,
  earlyConfirmText,
  graduatedToast,
  needsEarlyConfirmation,
} from './graduate-class-model';

describe('graduate class helpers', () => {
  it('orders the roster by last name', () => {
    const roster = [
      {
        studentId: '1',
        name: 'Zainab Bello',
        admissionNumber: 'GF-1',
        electives: [],
      },
      {
        studentId: '2',
        name: 'Ada Adams',
        admissionNumber: 'GF-2',
        electives: [],
      },
      {
        studentId: '3',
        name: 'Tobi Bello',
        admissionNumber: 'GF-3',
        electives: [],
      },
    ];
    expect(byLastName(roster).map((row) => row.name)).toEqual([
      'Ada Adams',
      'Tobi Bello',
      'Zainab Bello',
    ]);
  });

  it('asks for a second confirmation before the last term only', () => {
    const calendar = currentCalendar();
    const inTerm = (sequence: number) => ({
      ...calendar,
      term: calendar.term === null ? null : { ...calendar.term, sequence },
    });
    expect(needsEarlyConfirmation(inTerm(1))).toBe(true);
    expect(needsEarlyConfirmation(inTerm(2))).toBe(true);
    expect(needsEarlyConfirmation(inTerm(3))).toBe(false);
    expect(needsEarlyConfirmation(undefined)).toBe(true);
  });

  it('words the toast in the singular and the plural', () => {
    expect(graduatedToast(1)).toBe('1 student graduated.');
    expect(graduatedToast(3)).toBe('3 students graduated.');
  });

  it('words the explanation without a term while the current term is unknown', () => {
    expect(earlyConfirmText(undefined)).toBe(
      'Graduates leave the roll today and won’t be billed for the rest of the school year.'
    );
  });

  it('explains the early graduation', () => {
    expect(earlyConfirmText(currentCalendar())).toBe(
      'It is still First term. Graduates leave the roll today and won’t be billed for the rest of 2026/2027.'
    );
  });
});
