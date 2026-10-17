import { contract } from './contract';
import {
  ALREADY_DECIDED_MESSAGE,
  APPROVAL_KIND_LABELS,
  APPROVAL_KINDS,
  APPROVAL_RULE_BY_KIND,
  DECLINE_REASON_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  approvalItemSchema,
  approvalListQuerySchema,
  approvalStatusSchema,
  approvalSummarySchema,
  declineSchema,
} from './approvals';
import { apiErrorCodeSchema, errorSchema } from './schemas';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const item = {
  kind: 'payment_void',
  id,
  label: 'Cancel a payment',
  details: 'RCT-2026-00098 from Mrs Danjuma: Wrong child',
  amountMinor: 2_000_000,
  amountText: null,
  createdBy: { id, name: 'Chika' },
  createdAt: '2026-10-17T08:00:00.000Z',
  campusId: null,
  decide: 'yes',
};

describe('approval copy', () => {
  it('uses the PRD words for the two refusals', () => {
    expect(SELF_APPROVAL_MESSAGE).toBe(
      'You created this. Someone else must approve it.'
    );
    expect(ALREADY_DECIDED_MESSAGE).toBe('This has already been decided.');
  });

  it('knows the AlreadyDecided and SelfApproval codes and a creditMinor on an error', () => {
    expect(apiErrorCodeSchema.safeParse('AlreadyDecided').success).toBe(true);
    expect(apiErrorCodeSchema.safeParse('SelfApproval').success).toBe(true);
    expect(
      errorSchema.parse({
        code: 'BadRequest',
        message: 'x',
        creditMinor: 500_000,
      }).creditMinor
    ).toBe(500_000);
  });

  it('labels every kind and maps each to one switch', () => {
    expect(Object.keys(APPROVAL_KIND_LABELS)).toEqual([...APPROVAL_KINDS]);
    expect(APPROVAL_KIND_LABELS.payment_void).toBe('Cancel a payment');
    expect(APPROVAL_KIND_LABELS.credit_note).toBe('Reduce a fee');
    expect(APPROVAL_KIND_LABELS.write_off).toBe('Cancel a balance');
    expect(new Set(Object.values(APPROVAL_RULE_BY_KIND)).size).toBe(5);
  });
});

describe('approvalStatusSchema', () => {
  it('is submitted, approved or rejected', () => {
    expect(approvalStatusSchema.options).toEqual([
      'submitted',
      'approved',
      'rejected',
    ]);
  });
});

describe('declineSchema', () => {
  it('trims the reason and refuses a blank or missing one', () => {
    expect(declineSchema.parse({ reason: ' Not agreed ' })).toEqual({
      reason: 'Not agreed',
    });
    for (const body of [{ reason: '   ' }, {}]) {
      const result = declineSchema.safeParse(body);
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        DECLINE_REASON_MESSAGE,
      ]);
    }
  });
});

describe('approvalItemSchema', () => {
  it('parses an item and refuses a decide value outside yes and own', () => {
    expect(approvalItemSchema.parse(item)).toEqual(item);
    expect(
      approvalItemSchema.safeParse({ ...item, decide: 'no_permission' }).success
    ).toBe(false);
  });
});

describe('approvalSummarySchema', () => {
  it('previews at most five items', () => {
    const summary = {
      waitingForMe: 6,
      byNav: { approvals: 6, payments: 6 },
      currency: 'NGN',
      preview: [item, item, item, item, item],
    };
    expect(approvalSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      approvalSummarySchema.safeParse({
        ...summary,
        preview: [...summary.preview, item],
      }).success
    ).toBe(false);
  });
});

describe('approvalListQuerySchema', () => {
  it('defaults to page 1 and refuses page 0', () => {
    expect(approvalListQuerySchema.parse({})).toEqual({ page: 1 });
    expect(approvalListQuerySchema.safeParse({ page: '0' }).success).toBe(
      false
    );
  });
});

describe('contract.approvals', () => {
  it('serves the queue, the summary and the approval rules switch', () => {
    expect(contract.approvals.list.path).toBe('/approvals');
    expect(contract.approvals.summary.path).toBe('/approvals/summary');
    expect(contract.schoolSettings.updateApprovalRules.path).toBe(
      '/school-settings/approval-rules'
    );
    expect(contract.moneyAccounts.forRecording.path).toBe(
      '/finance/money-accounts/for-recording'
    );
  });
});
