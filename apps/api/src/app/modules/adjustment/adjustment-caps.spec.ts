import { capProblem } from './adjustment-caps';

const owing = { name: 'Bola Ade', balanceMinor: 1_200_000 };
const inCredit = { name: 'David Eze', balanceMinor: -500_000 };

describe('capProblem', () => {
  it('lets a write-off up to the balance owed, and no more', () => {
    expect(
      capProblem({
        kind: 'write_off',
        amountMinor: 1_200_000,
        student: owing,
        moment: 'ask',
      })
    ).toBeUndefined();
    expect(
      capProblem({
        kind: 'write_off',
        amountMinor: 1_500_000,
        student: owing,
        moment: 'ask',
      })
    ).toEqual({
      message: 'You can cancel at most what Bola Ade owes: ₦12,000.',
    });
  });

  it('refuses a write-off for a student who owes nothing', () => {
    expect(
      capProblem({
        kind: 'write_off',
        amountMinor: 100,
        student: inCredit,
        moment: 'ask',
      })?.message
    ).toBe('You can cancel at most what David Eze owes: ₦0.');
  });

  it('lets a refund up to the credit held and reports the credit when asked for more', () => {
    expect(
      capProblem({
        kind: 'refund',
        amountMinor: 500_000,
        student: inCredit,
        moment: 'ask',
      })
    ).toBeUndefined();
    expect(
      capProblem({
        kind: 'refund',
        amountMinor: 600_000,
        student: inCredit,
        moment: 'ask',
      })
    ).toEqual({
      creditMinor: 500_000,
      message: 'A refund pays back credit held. David Eze holds ₦5,000 credit.',
    });
  });

  it('refuses a refund for a student who holds no credit', () => {
    expect(
      capProblem({
        kind: 'refund',
        amountMinor: 100,
        student: owing,
        moment: 'ask',
      })
    ).toMatchObject({ creditMinor: 0 });
  });

  it('words the same breach for approval as "decline it and ask again"', () => {
    expect(
      capProblem({
        kind: 'refund',
        amountMinor: 500_000,
        student: { name: 'David Eze', balanceMinor: -100_000 },
        moment: 'approve',
      })?.message
    ).toBe(
      'David Eze now holds ₦1,000 credit, less than this refund. Decline it and ask again.'
    );
    expect(
      capProblem({
        kind: 'write_off',
        amountMinor: 1_200_000,
        student: { name: 'Bola Ade', balanceMinor: 200_000 },
        moment: 'approve',
      })?.message
    ).toContain('now owes ₦2,000');
  });

  it('never caps a fee reduction', () => {
    expect(
      capProblem({
        kind: 'credit_note',
        amountMinor: 9_000_000,
        student: inCredit,
        moment: 'ask',
      })
    ).toBeUndefined();
  });
});
