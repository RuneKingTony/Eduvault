import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Deletable, HandoverCandidate } from '@eduvault/api-contract';
import {
  OWNER_ROLE,
  SUPERSEDED_BY_OWNER,
  handoverRoles,
  isPortalOnly,
} from '@eduvault/policy';
import {
  MemberAdminService,
  OrganizationAdminService,
  type OrgContext,
} from '../../common/auth';
import { SchoolRepository, type StaffRecord } from './school.repository';

const NOT_DELETABLE_MESSAGE =
  'Not allowed: the school has students and money records.';

const ownerOnly = (verb: 'hand over' | 'delete') =>
  new ForbiddenException(`Only an owner can ${verb} the school.`);

/** An acting super admin has no `owner` role, with or without a reason. */
const isOwner = (ctx: OrgContext): boolean =>
  ctx.acting === null && ctx.roles.includes(OWNER_ROLE);

const isCandidate = (staff: StaffRecord): boolean =>
  !staff.roles.includes(OWNER_ROLE) && !isPortalOnly(staff.roles);

@Injectable()
export class SchoolService {
  constructor(
    private readonly school: SchoolRepository,
    private readonly members: MemberAdminService,
    private readonly organizations: OrganizationAdminService
  ) {}

  async handoverCandidates(ctx: OrgContext): Promise<HandoverCandidate[]> {
    if (!isOwner(ctx)) {
      throw ownerOnly('hand over');
    }
    const staff = await this.school.listStaff(ctx.organizationId);
    return staff
      .filter((member) => isCandidate(member))
      .map((member) => ({
        userId: member.userId,
        name: member.name,
        title: member.title,
        heldSenior: member.roles.filter((slug) =>
          SUPERSEDED_BY_OWNER.includes(slug)
        ),
      }));
  }

  handover(ctx: OrgContext, userId: string): Promise<{ ownerUserId: string }> {
    if (!isOwner(ctx)) {
      throw ownerOnly('hand over');
    }
    return this.members.underSchoolLock(ctx.organizationId, async () => {
      const [target, caller] = await Promise.all([
        this.school.findStaff(ctx.organizationId, userId),
        this.school.findStaff(ctx.organizationId, ctx.user.id),
      ]);
      if (caller?.roles.includes(OWNER_ROLE) !== true) {
        throw ownerOnly('hand over');
      }
      if (target === undefined) {
        throw new NotFoundException('Member not found');
      }
      if (!isCandidate(target)) {
        throw new ConflictException(
          target.roles.includes(OWNER_ROLE)
            ? 'Choose someone who is not already an owner.'
            : `${target.name} is a portal user (student or guardian) and can’t become an owner.`
        );
      }
      const roles = handoverRoles(target.roles, caller.roles);
      await this.members.handOverOwnership({
        target: { memberId: target.memberId, roles: roles.target },
        caller: { memberId: caller.memberId, roles: roles.caller },
      });
      return { ownerUserId: target.userId };
    });
  }

  async deletable(ctx: OrgContext): Promise<Deletable> {
    return (await this.school.hasStudents(ctx.organizationId))
      ? { ok: false, reason: NOT_DELETABLE_MESSAGE }
      : { ok: true };
  }

  remove(ctx: OrgContext, confirmName: string): Promise<{ id: string }> {
    if (!isOwner(ctx)) {
      throw ownerOnly('delete');
    }
    return this.organizations.underSchoolLock(ctx.organizationId, async () => {
      const [name, caller] = await Promise.all([
        this.school.schoolName(ctx.organizationId),
        this.school.findStaff(ctx.organizationId, ctx.user.id),
      ]);
      if (caller?.roles.includes(OWNER_ROLE) !== true) {
        throw ownerOnly('delete');
      }
      if (name === undefined || confirmName.trim() !== name) {
        throw new BadRequestException(
          'That isn’t the school’s name. Type it exactly as shown.'
        );
      }
      const { ok } = await this.deletable(ctx);
      if (!ok) {
        throw new ConflictException(NOT_DELETABLE_MESSAGE);
      }
      await this.organizations.deleteById(ctx.organizationId);
      return { id: ctx.organizationId };
    });
  }
}
