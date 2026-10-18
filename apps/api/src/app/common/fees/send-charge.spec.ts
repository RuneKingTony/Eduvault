import { assertBalancedLines } from '../ledger';
import { chargePostInput, type SendCharge } from './send-charge';

const input: SendCharge = {
  invoiceId: 'invoice-1',
  organizationId: 'school',
  studentId: 'ada',
  campusId: 'lekki',
  receivableId: 'owed-1100',
  journalKind: 'adhoc',
  memo: 'Charge · Ada Obi',
  lines: [
    { ledgerAccountId: 'tuition', amountMinor: 1_500_000 },
    { ledgerAccountId: 'uniform', amountMinor: 250_000 },
  ],
  today: '2026-10-18',
  actorId: 'bursar',
  year: 2026,
};

describe('chargePostInput', () => {
  const posting = chargePostInput(input, 'CHG-2026-00012');

  it('posts under the charge number, sourced from the invoice', () => {
    expect(posting).toMatchObject({
      organizationId: 'school',
      reference: 'CHG-2026-00012',
      kind: 'adhoc',
      effectiveOn: '2026-10-18',
      memo: 'Charge · Ada Obi',
      postedBy: 'bursar',
      sourceId: 'invoice-1',
    });
  });

  it('takes the journal kind from the input', () => {
    expect(
      chargePostInput({ ...input, journalKind: 'store' }, 'CHG-2026-00013').kind
    ).toBe('store');
  });

  it('owes the student on the charge’s campus and credits each line, balanced', () => {
    assertBalancedLines(posting.lines);
    expect(posting.lines).toHaveLength(4);
    expect(
      posting.lines
        .filter((line) => line.debitMinor > 0)
        .map((line) => [line.ledgerAccountId, line.studentId, line.campusId])
    ).toEqual([
      ['owed-1100', 'ada', 'lekki'],
      ['owed-1100', 'ada', 'lekki'],
    ]);
    expect(
      posting.lines
        .filter((line) => line.creditMinor > 0)
        .map((line) => [line.ledgerAccountId, line.creditMinor])
    ).toEqual([
      ['tuition', 1_500_000],
      ['uniform', 250_000],
    ]);
  });
});
