import { assertBalancedLines } from '../../common/ledger';
import {
  adjustmentLines,
  adjustmentMemo,
  type PostingFacts,
} from './adjustment-posting';

const facts: PostingFacts = {
  kind: 'credit_note',
  amountMinor: 1_000_000,
  studentId: 'ada',
  studentCampusId: 'lekki',
  receivableId: 'receivable',
  badDebtId: 'bad-debt',
  creditNoteAccountId: 'discounts-given',
  money: null,
};

describe('adjustmentLines', () => {
  it('reduces a fee: Dr the chosen account, Cr fees receivable for the student on their campus', () => {
    const lines = adjustmentLines(facts);
    expect(lines).toEqual([
      {
        ledgerAccountId: 'discounts-given',
        campusId: 'lekki',
        debitMinor: 1_000_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'receivable',
        studentId: 'ada',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 1_000_000,
      },
    ]);
    expect(() => assertBalancedLines(lines)).not.toThrow();
  });

  it('debits the income category the requester picked instead', () => {
    const [debit] = adjustmentLines({
      ...facts,
      creditNoteAccountId: 'tuition',
    });
    expect(debit?.ledgerAccountId).toBe('tuition');
  });

  it('cancels a balance: Dr bad debt, Cr fees receivable', () => {
    const lines = adjustmentLines({
      ...facts,
      kind: 'write_off',
      creditNoteAccountId: null,
      amountMinor: 1_200_000,
    });
    expect(lines).toEqual([
      {
        ledgerAccountId: 'bad-debt',
        campusId: 'lekki',
        debitMinor: 1_200_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'receivable',
        studentId: 'ada',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 1_200_000,
      },
    ]);
    expect(() => assertBalancedLines(lines)).not.toThrow();
  });

  it('refunds: Dr fees receivable for the student, Cr the money account on its own campus', () => {
    const lines = adjustmentLines({
      ...facts,
      kind: 'refund',
      creditNoteAccountId: null,
      amountMinor: 500_000,
      money: { ledgerAccountId: 'gtbank', campusId: null },
    });
    expect(lines).toEqual([
      {
        ledgerAccountId: 'receivable',
        studentId: 'ada',
        campusId: 'lekki',
        debitMinor: 500_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'gtbank',
        campusId: null,
        debitMinor: 0,
        creditMinor: 500_000,
      },
    ]);
    expect(() => assertBalancedLines(lines)).not.toThrow();
  });

  it('refuses a fee reduction or refund missing its account', () => {
    expect(() =>
      adjustmentLines({ ...facts, creditNoteAccountId: null })
    ).toThrow('account it debits');
    expect(() => adjustmentLines({ ...facts, kind: 'refund' })).toThrow(
      'money account'
    );
  });
});

describe('adjustmentMemo', () => {
  it('reads "{kind label}: {reason}" for the statement', () => {
    expect(adjustmentMemo('credit_note', 'Late enrolment')).toBe(
      'Reduce a fee: Late enrolment'
    );
    expect(adjustmentMemo('write_off', 'Left the school')).toBe(
      'Cancel a balance: Left the school'
    );
    expect(adjustmentMemo('refund', 'Overpaid')).toBe('Refund: Overpaid');
  });
});
