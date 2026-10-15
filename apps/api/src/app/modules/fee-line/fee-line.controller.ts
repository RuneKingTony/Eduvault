import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { FeeGridService } from './fee-grid.service';
import { FeeLineService } from './fee-line.service';
import { FeePreviewService } from './fee-preview.service';

const routes = contract.feeLines;

@Controller('fee-lines')
export class FeeLineController {
  constructor(
    private readonly fees: FeeLineService,
    private readonly grids: FeeGridService,
    private readonly previews: FeePreviewService
  ) {}

  @Get()
  @OrganizationAuth('feeLine', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<FeeLineService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.fees.list(org, query);
  }

  @Get('grid')
  @OrganizationAuth('feeLine', 'read')
  grid(
    @Org() org: OrgContext,
    @Query(zod(routes.grid.query))
    query: Parameters<FeeGridService['grid']>[1]
  ): Promise<RouteOutput<typeof routes.grid>> {
    return this.grids.grid(org, query);
  }

  @Get('candidates')
  @OrganizationAuth('feeLine', 'read')
  candidates(
    @Org() org: OrgContext,
    @Query(zod(routes.candidates.query))
    query: Parameters<FeePreviewService['candidates']>[1]
  ): Promise<RouteOutput<typeof routes.candidates>> {
    return this.previews.candidates(org, query);
  }

  @Get('preview')
  @OrganizationAuth('feeLine', 'read')
  preview(
    @Org() org: OrgContext,
    @Query(zod(routes.preview.query))
    query: Parameters<FeePreviewService['preview']>[1]
  ): Promise<RouteOutput<typeof routes.preview>> {
    return this.previews.preview(org, query);
  }

  @Post()
  @OrganizationAuth('feeLine', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<FeeLineService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.fees.create(org, body);
  }

  @Patch(':id')
  @OrganizationAuth('feeLine', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body))
    body: Parameters<FeeLineService['updateAmount']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.fees.updateAmount(org, params.id, body);
  }

  @Post(':id/retire')
  @OrganizationAuth('feeLine', 'retire')
  retire(
    @Org() org: OrgContext,
    @Param(zod(routes.retire.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.retire>> {
    return this.fees.retire(org, params.id);
  }
}
