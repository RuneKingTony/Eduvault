import { Injectable } from '@nestjs/common';
import {
  feeTypeDuplicateMessage,
  type CreateFeeTypeInput,
  type FeeType,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { accountConflict } from '../../common/ledger';
import { FeeTypeRepository } from './fee-line.repository';

@Injectable()
export class FeeTypeService {
  constructor(private readonly feeTypes: FeeTypeRepository) {}

  list(ctx: OrgContext): Promise<FeeType[]> {
    return this.feeTypes.list(ctx.organizationId);
  }

  async create(ctx: OrgContext, input: CreateFeeTypeInput): Promise<FeeType> {
    const name = input.name.trim();
    const outcome = await this.feeTypes.create(ctx.organizationId, name);
    if (outcome.status === 'saved') {
      return outcome.feeType;
    }
    throw accountConflict(outcome.status, feeTypeDuplicateMessage(name));
  }
}
