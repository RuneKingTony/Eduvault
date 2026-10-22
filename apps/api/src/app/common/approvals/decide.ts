import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ALREADY_DECIDED_MESSAGE,
  DECLINE_REASON_MESSAGE,
  SELF_APPROVAL_MESSAGE,
} from '@eduvault/api-contract';

interface Decision {
  actorId: string;
  createdBy: string | null;
  isOwner: boolean;
}

const isOwnRequest = ({ actorId, createdBy }: Decision): boolean =>
  createdBy !== null && createdBy === actorId;

export function assertNotOwn(decision: Decision): void {
  if (isOwnRequest(decision) && !decision.isOwner) {
    throw new ConflictException({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
  }
}

export function assertDeclineReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === '') {
    throw new BadRequestException(DECLINE_REASON_MESSAGE);
  }
  return trimmed;
}

export async function decide(
  decision: Decision,
  apply: (ownRequest: boolean) => Promise<boolean>
): Promise<void> {
  assertNotOwn(decision);
  if (!(await apply(isOwnRequest(decision)))) {
    throw new ConflictException({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
  }
}
