import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ALREADY_DECIDED_MESSAGE,
  DECLINE_REASON_MESSAGE,
  SELF_APPROVAL_MESSAGE,
} from '@eduvault/api-contract';

export interface Decision {
  actorId: string;
  createdBy: string | null;
}

export function assertNotOwn({ actorId, createdBy }: Decision): void {
  if (createdBy !== null && createdBy === actorId) {
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
  apply: () => Promise<boolean>
): Promise<void> {
  assertNotOwn(decision);
  if (!(await apply())) {
    throw new ConflictException({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
  }
}
