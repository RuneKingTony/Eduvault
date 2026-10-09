import { Injectable, NotFoundException } from '@nestjs/common';
import type { FeeSchedule } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { canSeeCampus } from '../../common/campus-scope';
import { CampusService } from '../campus/campus.service';
import {
  FeeScheduleRepository,
  type FeeSchedulePatch,
  type NewFeeSchedule,
} from './fee-schedule.repository';

@Injectable()
export class FeeScheduleService {
  constructor(
    private readonly fees: FeeScheduleRepository,
    private readonly campuses: CampusService
  ) {}

  /** A null campus applies to every campus, so every member of the school sees it. */
  private visible(ctx: OrgContext, fee: FeeSchedule) {
    return fee.campusId === null || canSeeCampus(ctx.campusScope, fee.campusId);
  }

  async list(ctx: OrgContext, campusId?: string): Promise<FeeSchedule[]> {
    if (campusId !== undefined && !canSeeCampus(ctx.campusScope, campusId)) {
      throw new NotFoundException('Campus not found');
    }
    const fees = await this.fees.list(ctx.organizationId, campusId);
    return fees.filter((fee) => this.visible(ctx, fee));
  }

  async get(ctx: OrgContext, id: string): Promise<FeeSchedule> {
    const fee = await this.fees.findById(ctx.organizationId, id);
    if (!fee || !this.visible(ctx, fee)) {
      throw new NotFoundException('Fee schedule not found');
    }
    return fee;
  }

  async create(ctx: OrgContext, input: NewFeeSchedule): Promise<FeeSchedule> {
    if (typeof input.campusId === 'string') {
      await this.campuses.assertInSchool(ctx, input.campusId);
    }
    return this.fees.create(ctx.organizationId, input);
  }

  async update(
    ctx: OrgContext,
    id: string,
    input: FeeSchedulePatch
  ): Promise<FeeSchedule> {
    await this.get(ctx, id);
    if (typeof input.campusId === 'string') {
      await this.campuses.assertInSchool(ctx, input.campusId);
    }
    const fee = await this.fees.update(ctx.organizationId, id, input);
    if (!fee) {
      throw new NotFoundException('Fee schedule not found');
    }
    return fee;
  }

  async remove(ctx: OrgContext, id: string): Promise<{ id: string }> {
    await this.get(ctx, id);
    await this.fees.remove(ctx.organizationId, id);
    return { id };
  }
}
