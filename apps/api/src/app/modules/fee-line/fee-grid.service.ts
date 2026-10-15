import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FEE_TERM_NOT_FOUND_MESSAGE,
  type FeeGrid,
  type FeeGridQuery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { buildFeeGrid } from '../../common/fees';
import { FeeLineRepository, FeeTypeRepository } from './fee-line.repository';
import { feeScopeOf, inFeeGroup } from './fee-line.service';

@Injectable()
export class FeeGridService {
  constructor(
    private readonly lines: FeeLineRepository,
    private readonly feeTypes: FeeTypeRepository
  ) {}

  async grid(ctx: OrgContext, query: FeeGridQuery): Promise<FeeGrid> {
    const term = await this.lines.findTerm(ctx.organizationId, query.termId);
    if (term === undefined) {
      throw new NotFoundException(FEE_TERM_NOT_FOUND_MESSAGE);
    }
    const [live, feeTypes, currency] = await Promise.all([
      this.lines.list(feeScopeOf(ctx), {
        termId: query.termId,
        includeRetired: false,
      }),
      this.feeTypes.list(ctx.organizationId),
      this.lines.currency(ctx.organizationId),
    ]);
    const shown = feeTypes.filter(
      (feeType) =>
        inFeeGroup(feeType.code, query.group) &&
        (query.group === 'school' ||
          query.feeTypeId === undefined ||
          feeType.id === query.feeTypeId)
    );
    return {
      currency,
      feeTypes: shown,
      rows: buildFeeGrid({
        live,
        shown,
        withTypicalTotal: query.group === 'school',
      }),
    };
  }
}
