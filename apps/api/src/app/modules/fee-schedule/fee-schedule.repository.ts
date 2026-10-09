import type { FeeSchedule } from '@eduvault/api-contract';

export interface NewFeeSchedule {
  campusId?: string | null;
  name: string;
  amountMinor: number;
  currency: string;
}

export type FeeSchedulePatch = Partial<NewFeeSchedule>;

export abstract class FeeScheduleRepository {
  /** With a campus, returns that campus's schedules plus the school-wide ones. */
  abstract list(
    organizationId: string,
    campusId?: string
  ): Promise<FeeSchedule[]>;

  abstract findById(
    organizationId: string,
    id: string
  ): Promise<FeeSchedule | undefined>;

  abstract create(
    organizationId: string,
    input: NewFeeSchedule
  ): Promise<FeeSchedule>;

  abstract update(
    organizationId: string,
    id: string,
    patch: FeeSchedulePatch
  ): Promise<FeeSchedule | undefined>;

  abstract remove(organizationId: string, id: string): Promise<void>;
}
