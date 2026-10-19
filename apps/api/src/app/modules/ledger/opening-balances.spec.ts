import { isReservedReference } from '@eduvault/shared';
import {
  OPENING_MEMO,
  planMoneyAccountEntry,
  planStudentEntry,
} from './opening-balances';

const student = {
  studentId: 'stu-1',
  amountMinor: 1_200_000,
  direction: 'debt',
  effectiveOn: '2026-09-01',
} as const;
const target = { campusId: 'lekki', receivableId: 'r', equityId: 'e' };

describe('planStudentEntry', () => {
  it('books a debt as debit fees owed and credit opening balance', () => {
    const entry = planStudentEntry(student, target);
    expect(entry.reference).toBe('OPEN-stu-1');
    expect(entry.effectiveOn).toBe('2026-09-01');
    expect(entry.memo).toBe(OPENING_MEMO);
    expect(entry.subject).toEqual({ studentId: 'stu-1' });
    expect(entry.lines).toEqual([
      {
        ledgerAccountId: 'r',
        studentId: 'stu-1',
        campusId: 'lekki',
        debitMinor: 1_200_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'e',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 1_200_000,
      },
    ]);
  });

  it('reverses both lines for a credit the school holds', () => {
    const entry = planStudentEntry(
      { ...student, direction: 'credit', amountMinor: 500_000 },
      target
    );
    expect(
      entry.lines.map((line) => [
        line.ledgerAccountId,
        line.debitMinor,
        line.creditMinor,
      ])
    ).toEqual([
      ['r', 0, 500_000],
      ['e', 500_000, 0],
    ]);
  });

  it('puts the student only on the fees owed line and the campus on both', () => {
    const [fees, equity] = planStudentEntry(student, target).lines;
    expect(fees?.studentId).toBe('stu-1');
    expect(equity?.studentId).toBeUndefined();
    expect(fees?.campusId).toBe('lekki');
    expect(equity?.campusId).toBe('lekki');
  });

  it('keeps the memo the caller wrote', () => {
    expect(
      planStudentEntry({ ...student, memo: 'Carried over from 2025' }, target)
        .memo
    ).toBe('Carried over from 2025');
  });
});

describe('planMoneyAccountEntry', () => {
  const item = {
    moneyAccountId: 'ma-1',
    amountMinor: 9_500_000,
    effectiveOn: '2026-09-01',
  };

  it('debits the money account and credits opening balance on its campus', () => {
    const entry = planMoneyAccountEntry(item, {
      campusId: 'lekki',
      ledgerAccountId: 'la-1210',
      equityId: 'e',
    });
    expect(entry.reference).toBe('OPEN-MA-ma-1');
    expect(entry.subject).toEqual({ moneyAccountId: 'ma-1' });
    expect(entry.lines).toEqual([
      {
        ledgerAccountId: 'la-1210',
        campusId: 'lekki',
        debitMinor: 9_500_000,
        creditMinor: 0,
      },
      {
        ledgerAccountId: 'e',
        campusId: 'lekki',
        debitMinor: 0,
        creditMinor: 9_500_000,
      },
    ]);
  });

  it('has no campus for a school-wide account', () => {
    const entry = planMoneyAccountEntry(item, {
      campusId: null,
      ledgerAccountId: 'la-1210',
      equityId: 'e',
    });
    expect(entry.lines.map((line) => line.campusId)).toEqual([null, null]);
  });
});

describe('opening references', () => {
  it('stay out of reach of a client-chosen payment reference', () => {
    const money = planMoneyAccountEntry(
      { moneyAccountId: 'ma-1', amountMinor: 5, effectiveOn: '2026-09-01' },
      { campusId: null, ledgerAccountId: 'la', equityId: 'e' }
    );
    expect(
      isReservedReference(planStudentEntry(student, target).reference)
    ).toBe(true);
    expect(isReservedReference(money.reference)).toBe(true);
  });
});
