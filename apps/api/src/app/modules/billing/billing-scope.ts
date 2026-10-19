import type { OrgContext } from '../../common/auth';
import type { CampusScope } from '../../common/campus-scope';

export interface BillingScope {
  organizationId: string;
  campusScope: CampusScope;
}

export const scopeOf = (ctx: OrgContext): BillingScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});
