import { Injectable } from '@nestjs/common';
import {
  feeTypeDuplicateMessage,
  type CreateFeeTypeInput,
  type FeeType,
} from '@eduvault/api-contract';
import { feeTypeCreatedActivity, financeActorIn } from '../../common/activity';
import type { OrgContext } from '../../common/auth';
import { accountConflict } from '../../common/ledger';
import { FeeLineRepository, FeeTypeRepository } from './fee-line.repository';

@Injectable()
export class FeeTypeService {
  constructor(
    private readonly feeTypes: FeeTypeRepository,
    private readonly lines: FeeLineRepository
  ) {}

  list(ctx: OrgContext): Promise<FeeType[]> {
    return this.feeTypes.list(ctx.organizationId);
  }

  async create(ctx: OrgContext, input: CreateFeeTypeInput): Promise<FeeType> {
    const name = input.name.trim();
    const actor = await financeActorIn(ctx, {
      currency: () => this.lines.currency(ctx.organizationId),
    });
    const outcome = await this.feeTypes.create(
      ctx.organizationId,
      name,
      (feeType) => feeTypeCreatedActivity(actor, feeType)
    );
    if (outcome.status === 'saved') {
      return outcome.feeType;
    }
    throw accountConflict(outcome.status, feeTypeDuplicateMessage(name));
  }
}
