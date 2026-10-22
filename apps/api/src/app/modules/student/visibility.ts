import type { OrgContext } from '../../common/auth';
import type { CampusScope } from '../../common/campus-scope';
import type { ClassScope } from '../../common/class-scope';

export interface StudentVisibility {
  campusScope: CampusScope;
  classScope: ClassScope;
}

export const scopeOf = (ctx: OrgContext): StudentVisibility => ({
  campusScope: ctx.campusScope,
  classScope: ctx.classScope,
});
