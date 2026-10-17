import { Injectable } from '@nestjs/common';
import type { PortalPriceList, PortalPurchases } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { StoreReadService } from '../store/store-read.service';
import { PortalService } from './portal.service';

@Injectable()
export class PortalStoreService {
  constructor(
    private readonly portal: PortalService,
    private readonly store: StoreReadService
  ) {}

  async purchasesFor(
    ctx: OrgContext,
    studentId: string
  ): Promise<PortalPurchases> {
    await this.portal.require(ctx, studentId);
    return this.store.purchasesOf(ctx, studentId);
  }

  async priceListFor(
    ctx: OrgContext,
    studentId: string
  ): Promise<PortalPriceList> {
    await this.portal.require(ctx, studentId);
    return this.store.priceListFor(ctx, studentId);
  }
}
