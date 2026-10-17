import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { AdjustmentService } from './adjustment.service';
import { DiscountService } from './discount.service';

const adjustmentRoutes = contract.adjustments;
const discountRoutes = contract.studentDiscounts;

@Controller('finance')
export class AdjustmentController {
  constructor(
    private readonly adjustments: AdjustmentService,
    private readonly discounts: DiscountService
  ) {}

  @Get('adjustments')
  @OrganizationAuth('adjustment', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(adjustmentRoutes.list.query))
    query: Parameters<AdjustmentService['list']>[1]
  ): Promise<RouteOutput<typeof adjustmentRoutes.list>> {
    return this.adjustments.list(org, query);
  }

  @Get('adjustments/:id')
  @OrganizationAuth('adjustment', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(adjustmentRoutes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof adjustmentRoutes.get>> {
    return this.adjustments.get(org, params.id);
  }

  @Post('adjustments')
  @OrganizationAuth('adjustment', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(adjustmentRoutes.create.body))
    body: Parameters<AdjustmentService['create']>[1]
  ): Promise<RouteOutput<typeof adjustmentRoutes.create>> {
    return this.adjustments.create(org, body);
  }

  @Post('adjustments/:id/approve')
  @HttpCode(200)
  @OrganizationAuth('adjustment', 'approve')
  approve(
    @Org() org: OrgContext,
    @Param(zod(adjustmentRoutes.approve.params)) params: { id: string }
  ): Promise<RouteOutput<typeof adjustmentRoutes.approve>> {
    return this.adjustments.approve(org, params.id);
  }

  @Post('adjustments/:id/decline')
  @HttpCode(200)
  @OrganizationAuth('adjustment', 'approve')
  decline(
    @Org() org: OrgContext,
    @Param(zod(adjustmentRoutes.decline.params)) params: { id: string },
    @Body(zod(adjustmentRoutes.decline.body)) body: { reason: string }
  ): Promise<RouteOutput<typeof adjustmentRoutes.decline>> {
    return this.adjustments.decline(org, params.id, body.reason);
  }

  @Get('discounts')
  @OrganizationAuth('adjustment', 'read')
  listDiscounts(
    @Org() org: OrgContext,
    @Query(zod(discountRoutes.list.query))
    query: Parameters<DiscountService['list']>[1]
  ): Promise<RouteOutput<typeof discountRoutes.list>> {
    return this.discounts.list(org, query);
  }

  @Get('discounts/terms')
  @OrganizationAuth('adjustment', 'read')
  discountTerms(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof discountRoutes.terms>> {
    return this.discounts.termChoices(org);
  }

  @Post('discounts')
  @OrganizationAuth('adjustment', 'create')
  createDiscount(
    @Org() org: OrgContext,
    @Body(zod(discountRoutes.create.body))
    body: Parameters<DiscountService['create']>[1]
  ): Promise<RouteOutput<typeof discountRoutes.create>> {
    return this.discounts.create(org, body);
  }

  @Post('discounts/:id/approve')
  @HttpCode(200)
  @OrganizationAuth('adjustment', 'approve')
  approveDiscount(
    @Org() org: OrgContext,
    @Param(zod(discountRoutes.approve.params)) params: { id: string }
  ): Promise<RouteOutput<typeof discountRoutes.approve>> {
    return this.discounts.approve(org, params.id);
  }

  @Post('discounts/:id/decline')
  @HttpCode(200)
  @OrganizationAuth('adjustment', 'approve')
  declineDiscount(
    @Org() org: OrgContext,
    @Param(zod(discountRoutes.decline.params)) params: { id: string },
    @Body(zod(discountRoutes.decline.body)) body: { reason: string }
  ): Promise<RouteOutput<typeof discountRoutes.decline>> {
    return this.discounts.decline(org, params.id, body.reason);
  }

  @Post('discounts/:id/end')
  @HttpCode(200)
  @OrganizationAuth('adjustment', 'create')
  endDiscount(
    @Org() org: OrgContext,
    @Param(zod(discountRoutes.end.params)) params: { id: string },
    @Body(zod(discountRoutes.end.body))
    body: Parameters<DiscountService['end']>[2]
  ): Promise<RouteOutput<typeof discountRoutes.end>> {
    return this.discounts.end(org, params.id, body);
  }
}
