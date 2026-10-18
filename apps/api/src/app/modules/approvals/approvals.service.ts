import { Injectable } from '@nestjs/common';
import {
  APPROVAL_KIND_LABELS,
  APPROVAL_KIND_PERMISSION,
  APPROVAL_PAGE_SIZE,
  APPROVAL_PREVIEW_SIZE,
  isMoneyApproval,
  type ApprovalDecide,
  type ApprovalKind,
  type ApprovalPillar,
  type ApprovalItem,
  type ApprovalList,
  type ApprovalListQuery,
  type ApprovalSummary,
} from '@eduvault/api-contract';
import { can, holds } from '@eduvault/policy';
import { ApprovalRegistry, type WaitingApproval } from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import { CampusService } from '../campus/campus.service';
import { ApprovalsRepository } from './approvals.repository';

const oldestFirst = (a: ApprovalItem, b: ApprovalItem): number =>
  a.createdAt === b.createdAt
    ? a.id.localeCompare(b.id)
    : a.createdAt.localeCompare(b.createdAt);

const pillarOf = (kind: ApprovalKind): ApprovalPillar =>
  isMoneyApproval(kind) ? 'money' : 'leave';

const decideFor = (
  ctx: OrgContext,
  waiting: WaitingApproval
): ApprovalDecide => {
  if (waiting.createdById === ctx.user.id) {
    return 'own';
  }
  return ctx.acting !== null ||
    holds(ctx.permissions, APPROVAL_KIND_PERMISSION[waiting.kind])
    ? 'yes'
    : 'other';
};

const toItem = (waiting: WaitingApproval, ctx: OrgContext): ApprovalItem => ({
  kind: waiting.kind,
  id: waiting.id,
  label: APPROVAL_KIND_LABELS[waiting.kind],
  details: waiting.details,
  amountMinor: waiting.amountMinor,
  amountText: waiting.amountText,
  createdBy: { id: waiting.createdById, name: waiting.createdByName },
  createdAt: waiting.createdAt,
  campusId: waiting.campusId,
  decide: decideFor(ctx, waiting),
});

const sees = (ctx: OrgContext): boolean =>
  ctx.acting !== null ||
  Object.values(APPROVAL_KIND_PERMISSION).some((permission) =>
    holds(ctx.permissions, permission)
  );

/** A viewer who decides only leave learns about money requests only if they may read them. */
const mayShow = (ctx: OrgContext, item: ApprovalItem): boolean =>
  item.decide !== 'other' ||
  !isMoneyApproval(item.kind) ||
  can(ctx.permissions, 'adjustment', 'read');

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly registry: ApprovalRegistry,
    private readonly approvals: ApprovalsRepository,
    private readonly campuses: CampusService
  ) {}

  async list(ctx: OrgContext, query: ApprovalListQuery): Promise<ApprovalList> {
    if (query.campusId !== undefined) {
      await this.campuses.assertInScope(ctx, query.campusId);
    }
    const [currency, items] = await Promise.all([
      this.approvals.currency(ctx.organizationId),
      this.waiting(ctx, query.campusId),
    ]);
    const decidable = items.filter((item) => item.decide !== 'other').length;
    const shown = items.filter(
      (item) => item.decide !== 'other' || query.includeOthers
    );
    const inPillar = shown.filter(
      (item) =>
        query.pillar === undefined || pillarOf(item.kind) === query.pillar
    );
    const from = (query.page - 1) * APPROVAL_PAGE_SIZE;
    return {
      currency,
      items: inPillar.slice(from, from + APPROVAL_PAGE_SIZE),
      total: inPillar.length,
      othersCount: items.length - decidable,
      pillars: {
        money: shown.filter((item) => pillarOf(item.kind) === 'money').length,
        leave: shown.filter((item) => pillarOf(item.kind) === 'leave').length,
      },
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
        payments: mine.filter(
          (item) =>
            isMoneyApproval(item.kind) && item.kind !== 'store_write_off'
        ).length,
        store,
      },
      preview: mine.slice(0, APPROVAL_PREVIEW_SIZE),
    };
  }

  private async waiting(
    ctx: OrgContext,
    campusId?: string
  ): Promise<ApprovalItem[]> {
    if (!sees(ctx)) {
      return [];
    }
    const scope = {
      organizationId: ctx.organizationId,
      campusScope: campusId === undefined ? ctx.campusScope : [campusId],
    };
    const lists = await Promise.all(
      this.registry.all().map((provider) => provider.waiting(scope))
    );
    return lists
      .flat()
      .map((waiting) => toItem(waiting, ctx))
      .filter((item) => mayShow(ctx, item))
      .toSorted(oldestFirst);
  }
}
