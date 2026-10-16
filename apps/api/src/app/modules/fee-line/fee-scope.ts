import { TUITION_FEE_CODE, type FeeGroup } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { FeeScope } from './fee-line.repository';

export const feeScopeOf = (ctx: OrgContext): FeeScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

export const inFeeGroup = (
  code: number,
  group: FeeGroup | undefined
): boolean =>
  group === undefined || (group === 'school') === (code === TUITION_FEE_CODE);
