import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  WALLET_REFERENCE_TAKEN_MESSAGE,
  WALLET_REQUEST_NOT_FOUND_MESSAGE,
  type WalletApprovalKind,
} from '@eduvault/api-contract';
import { assertDeclineReason, decide } from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import { orgScopeOf } from '../../common/scope';
import type { ExistingEntry, WalletRepository } from './wallet.repository';

export const requestNotFound = (): NotFoundException =>
  new NotFoundException(WALLET_REQUEST_NOT_FOUND_MESSAGE);

export function assertReplay(
  existing: ExistingEntry,
  expected: { walletId: string; requestHash: string }
): void {
  if (
    existing.walletId !== expected.walletId ||
    existing.requestHash !== expected.requestHash
  ) {
    throw new ConflictException(WALLET_REFERENCE_TAKEN_MESSAGE);
  }
}

export async function decideRequest(
  wallets: WalletRepository,
  ctx: OrgContext,
  target: {
    kind: WalletApprovalKind;
    id: string;
    run: (ownRequest: boolean) => Promise<boolean>;
  }
): Promise<void> {
  const record = await wallets.requestRecord(
    orgScopeOf(ctx),
    target.kind,
    target.id
  );
  if (record === undefined) {
    throw requestNotFound();
  }
  await decide(
    {
      actorId: ctx.user.id,
      createdBy: record.createdBy,
      isOwner: ctx.isOwner,
    },
    async (ownRequest) =>
      record.status === 'submitted' && target.run(ownRequest)
  );
}

export async function declineRequest(
  wallets: WalletRepository,
  ctx: OrgContext,
  target: { kind: WalletApprovalKind; id: string; reason: string }
): Promise<void> {
  const reason = assertDeclineReason(target.reason);
  await decideRequest(wallets, ctx, {
    ...target,
    run: async () => {
      const outcome = await wallets.declineRequest(target.kind, {
        organizationId: ctx.organizationId,
        userId: ctx.user.id,
        userName: ctx.user.name,
        id: target.id,
        reason,
      });
      return outcome.status === 'declined';
    },
  });
}
