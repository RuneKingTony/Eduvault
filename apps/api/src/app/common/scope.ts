import type { OrgContext } from './auth';
import type { CampusScope } from './campus-scope';
import type { ClassScope } from './class-scope';

export interface OrgScope {
  organizationId: string;
  campusScope: CampusScope;
}

export interface CampusClassScope {
  campusScope: CampusScope;
  classScope: ClassScope;
}

export const orgScopeOf = (ctx: OrgContext): OrgScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

export const campusClassScopeOf = (ctx: OrgContext): CampusClassScope => ({
  campusScope: ctx.campusScope,
  classScope: ctx.classScope,
});
