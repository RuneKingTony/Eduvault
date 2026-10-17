import { APPROVAL_KINDS, isMoneyApproval } from '@eduvault/api-contract';
import { approvalRulesOf, isApprovalOn, isRuleOn } from './approval-rules';

const row = {
  approve_refund: true,
  approve_write_off: false,
  approve_credit_note: true,
  approve_discount: false,
  approve_payment_void: true,
};

describe('approvalRulesOf', () => {
  it('maps the five columns to the five switches', () => {
    expect(approvalRulesOf(row)).toEqual({
      refund: true,
      writeOff: false,
      creditNote: true,
      discount: false,
      paymentVoid: true,
    });
  });
});

describe('isRuleOn', () => {
  it('reads the switch of each kind', () => {
    const rules = approvalRulesOf(row);
    const on = APPROVAL_KINDS.filter(isMoneyApproval).filter((kind) =>
      isRuleOn(rules, kind)
    );
    expect(on).toEqual(['payment_void', 'credit_note', 'refund']);
  });
});

const dbReturning = (found: typeof row | undefined) =>
  ({
    selectFrom: () => ({
      select: () => ({
        where: () => ({ executeTakeFirst: () => Promise.resolve(found) }),
      }),
    }),
  }) as unknown as Parameters<typeof isApprovalOn>[0];

describe('isApprovalOn', () => {
  it('reads the school’s switch for the kind', async () => {
    const db = dbReturning(row);
    expect(await isApprovalOn(db, 'school-a', 'refund')).toBe(true);
    expect(await isApprovalOn(db, 'school-a', 'write_off')).toBe(false);
  });

  it('keeps approval on when the school has no settings row', async () => {
    expect(
      await isApprovalOn(dbReturning(undefined), 'school-a', 'discount')
    ).toBe(true);
  });
});
