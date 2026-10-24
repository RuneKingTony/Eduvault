import { describe, expect, it } from 'vitest';
import type { Wallet } from '@eduvault/api-contract';
import { familyBalanceMinor } from './family-balance';

const kids = (...owed: number[]): Wallet['children'] =>
  owed.map((owedMinor, i) => ({
    studentId: `s${i}`,
    name: `Child ${i}`,
    admissionNumber: `GF-${i}`,
    inScope: true,
    owedMinor,
    earmarkMinor: 0,
    spendableMinor: 0,
    oldestUnpaidOn: null,
  }));

describe('familyBalanceMinor', () => {
  it('adds up the debts', () => {
    expect(familyBalanceMinor(kids(200_000, 300_000))).toBe(500_000);
  });

  it('does not let one child’s credit offset another’s debt', () => {
    expect(familyBalanceMinor(kids(200_000, -500_000))).toBe(200_000);
  });

  it('is the credit, negative, when nothing is owed', () => {
    expect(familyBalanceMinor(kids(0, -500_000))).toBe(-500_000);
  });

  it('is zero for a family that owes and holds nothing', () => {
    expect(familyBalanceMinor(kids(0, 0))).toBe(0);
    expect(familyBalanceMinor([])).toBe(0);
  });
});
