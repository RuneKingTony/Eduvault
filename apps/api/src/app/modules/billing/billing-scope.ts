import type { OrgContext } from '../../common/auth';
import type { BillingScope } from './billing.repository';

export const scopeOf = (ctx: OrgContext): BillingScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});
