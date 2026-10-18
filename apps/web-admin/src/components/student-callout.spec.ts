import type { StudentDetail } from '@eduvault/api-contract';
import { lifecycleMessage } from './student-callout';
import { studentDetail } from '../test-students';

const OWED = ' ₦5,000 is still owed and stays in Who owes.';

const left = studentDetail({
  life: 'left',
  exit: {
    kind: 'left',
    on: '2026-09-25',
    reason: 'Relocated',
    note: null,
    recordedOn: '2026-09-28',
  },
});
const graduated = studentDetail({
  life: 'graduated',
  exit: {
    kind: 'graduated',
    on: '2026-07-24',
    reason: 'Completed SS 3',
    note: null,
    recordedOn: '2026-07-24',
  },
});
const dueLeft = studentDetail({
  life: 'inactive',
  dueLeft: true,
  notSeenSince: '2026-05-22',
  weeksAway: 20,
});
const inactive = studentDetail({
  life: 'inactive',
  notSeenSince: '2026-09-01',
  weeksAway: 6,
});
const marked = studentDetail({ notSeenSince: '2026-10-01', weeksAway: 1 });

const messageFor = (
  student: StudentDetail,
  balanceMinor: number | undefined,
  currency: string | undefined
) => lifecycleMessage({ ...student, balanceMinor, currency });

describe('lifecycleMessage owed suffix', () => {
  it.each([
    ['Left', left],
    ['Graduated', graduated],
    ['due to be marked Left', dueLeft],
    ['Inactive', inactive],
  ])('ends a %s message with the amount owed', (_state, student) => {
    const plain = messageFor(student, undefined, undefined);
    expect(messageFor(student, 500_000, 'NGN')).toBe(`${plain}${OWED}`);
  });

  it.each([
    ['nothing is owed', 0, 'NGN'],
    ['the student is in credit', -500_000, 'NGN'],
    ['there is no balance', undefined, 'NGN'],
    ['there is no currency', 500_000, undefined],
  ])('adds nothing when %s', (_case, balance, currency) => {
    for (const student of [left, graduated, dueLeft, inactive]) {
      expect(messageFor(student, balance, currency)).toBe(
        messageFor(student, undefined, undefined)
      );
    }
  });

  it('never adds it to the marked-but-still-Active message', () => {
    const message = messageFor(marked, 500_000, 'NGN');
    expect(message).toMatch(/^Not seen since /);
    expect(message).not.toContain('is still owed');
  });

  it('has no message for an ordinary student whatever they owe', () => {
    expect(messageFor(studentDetail(), 500_000, 'NGN')).toBeNull();
  });
});
