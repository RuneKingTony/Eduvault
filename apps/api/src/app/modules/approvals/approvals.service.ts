import { Injectable } from '@nestjs/common';
import {
  APPROVAL_KIND_LABELS,
  APPROVAL_PAGE_SIZE,
  APPROVAL_PREVIEW_SIZE,
  type ApprovalItem,
  type ApprovalList,
  type ApprovalListQuery,
  type ApprovalSummary,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import { ApprovalRegistry, type WaitingApproval } from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import { ApprovalsRepository } from './approvals.repository';

const oldestFirst = (a: ApprovalItem, b: ApprovalItem): number =>
  a.createdAt === b.createdAt
    ? a.id.localeCompare(b.id)
    : a.createdAt.localeCompare(b.createdAt);

const toItem = (waiting: WaitingApproval, viewerId: string): ApprovalItem => ({
  kind: waiting.kind,
  id: waiting.id,
  label: APPROVAL_KIND_LABELS[waiting.kind],
  details: waiting.details,
  amountMinor: waiting.amountMinor,
  amountText: waiting.amountText,
  createdBy: { id: waiting.createdById, name: waiting.createdByName },
  createdAt: waiting.createdAt,
  campusId: waiting.campusId,
  decide: waiting.createdById === viewerId ? 'own' : 'yes',
});

const sees = (ctx: OrgContext): boolean =>
  can(ctx.permissions, 'adjustment', 'approve') || ctx.acting !== null;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly registry: ApprovalRegistry,
    private readonly approvals: ApprovalsRepository
  ) {}

  async list(ctx: OrgContext, query: ApprovalListQuery): Promise<ApprovalList> {
    const [currency, items] = await Promise.all([
      this.approvals.currency(ctx.organizationId),
      this.waiting(ctx),
    ]);
    const from = (query.page - 1) * APPROVAL_PAGE_SIZE;
    return {
      currency,
      items: items.slice(from, from + APPROVAL_PAGE_SIZE),
      total: items.length,
    };
  }

  async summary(ctx: OrgContext): Promise<ApprovalSummary> {
    const [currency, items] = await Promise.all([
      this.approvals.currency(ctx.organizationId),
      this.waiting(ctx),
    ]);
    const mine = items.filter((item) => item.decide === 'yes');
    const store = mine.filter((item) => item.kind === 'store_write_off').length;
    return {
      currency,
      waitingForMe: mine.length,
      byNav: {
        approvals: mine.length,
        payments: mine.length - store,
        store,
      },
      preview: mine.slice(0, APPROVAL_PREVIEW_SIZE),
    };
  }

  private async waiting(ctx: OrgContext): Promise<ApprovalItem[]> {
    if (!sees(ctx)) {
      return [];
    }
    const scope = {
      organizationId: ctx.organizationId,
      campusScope: ctx.campusScope,
    };
    const lists = await Promise.all(
      this.registry.all().map((provider) => provider.waiting(scope))
    );
    return lists
      .flat()
      .map((waiting) => toItem(waiting, ctx.user.id))
      .toSorted(oldestFirst);
  }
}
