import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PORTAL_STUDENT_NOT_FOUND_MESSAGE,
  type PortalAnnouncementList,
  type PortalAnnouncementListQuery,
  type PortalAnnouncements,
  type PortalAnnouncementsQuery,
  type PortalChild,
  type PortalFamilyStatement,
  type PortalMe,
  type PortalStatement,
  type PortalStatementQuery,
  type PortalPriceList,
  type PortalPurchases,
  type PortalStudent,
} from '@eduvault/api-contract';
import { holds } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { AnnouncementService } from '../announcement/announcement.service';
import { orderTeachers } from '../class/class-view';
import { StoreReadService } from '../store/store-read.service';
import { StudentAccountService } from '../student-account/student-account.service';
import {
  firstNameOf,
  portalKindOf,
  realEmail,
  toPortalFamilyStatement,
  toPortalStatement,
} from './portal-rules';
import {
  PortalRepository,
  type PortalScope,
  type PortalStudentRecord,
} from './portal.repository';

const scopeOf = (ctx: OrgContext): PortalScope => ({
  organizationId: ctx.organizationId,
  studentScope: ctx.studentScope,
});

@Injectable()
export class PortalService {
  constructor(
    private readonly portal: PortalRepository,
    private readonly announcements: AnnouncementService,
    private readonly accounts: StudentAccountService,
    private readonly store: StoreReadService
  ) {}

  async me(ctx: OrgContext): Promise<PortalMe> {
    const [profile, children] = await Promise.all([
      this.portal.profile(ctx.organizationId, ctx.user.id),
      this.portal.children(scopeOf(ctx)),
    ]);
    if (profile === undefined) {
      throw new NotFoundException('School not found');
    }
    return {
      kind: portalKindOf(profile.studentFirstName !== null),
      name: profile.name,
      firstName: firstNameOf(profile.name, profile.studentFirstName),
      login: {
        username: profile.username,
        email: realEmail(profile.email),
      },
      school: profile.school,
      children,
    };
  }

  children(ctx: OrgContext): Promise<PortalChild[]> {
    return holds(ctx.permissions, 'invoice:readOwn')
      ? this.portal.childrenWithBalance(scopeOf(ctx))
      : this.portal.children(scopeOf(ctx));
  }

  async statement(
    ctx: OrgContext,
    studentId: string,
    query: PortalStatementQuery
  ): Promise<PortalStatement> {
    const record = await this.require(ctx, studentId);
    const own = await this.accounts.ownStatement(ctx, studentId, query);
    return toPortalStatement(record, own);
  }

  async familyStatement(ctx: OrgContext): Promise<PortalFamilyStatement> {
    const children = await this.portal.children(scopeOf(ctx));
    const { currency, balances } = await this.accounts.ownBalances(
      ctx,
      children.map((child) => child.id)
    );
    return toPortalFamilyStatement(currency, children, balances);
  }

  async student(ctx: OrgContext, studentId: string): Promise<PortalStudent> {
    const record = await this.require(ctx, studentId);
    const { campusId: _campusId, armId, ...facts } = record;
    return { ...facts, classTeacherName: await this.classTeacher(ctx, armId) };
  }

  async announcementsFor(
    ctx: OrgContext,
    studentId: string,
    query: PortalAnnouncementsQuery
  ): Promise<PortalAnnouncements> {
    const record = await this.require(ctx, studentId);
    return this.announcements.forPortal(ctx, {
      campusId: record.campusId,
      limit: query.limit,
    });
  }

  async announcementListFor(
    ctx: OrgContext,
    studentId: string,
    query: PortalAnnouncementListQuery
  ): Promise<PortalAnnouncementList> {
    const record = await this.require(ctx, studentId);
    return this.announcements.forPortalList(ctx, {
      campusId: record.campusId,
      ...query,
    });
  }

  async purchasesFor(
    ctx: OrgContext,
    studentId: string
  ): Promise<PortalPurchases> {
    await this.require(ctx, studentId);
    return this.store.purchasesOf(ctx, studentId);
  }

  async priceListFor(
    ctx: OrgContext,
    studentId: string
  ): Promise<PortalPriceList> {
    await this.require(ctx, studentId);
    return this.store.priceListFor(ctx, studentId);
  }

  private async require(
    ctx: OrgContext,
    studentId: string
  ): Promise<PortalStudentRecord> {
    const record = ctx.studentScope.includes(studentId)
      ? await this.portal.student(scopeOf(ctx), studentId)
      : undefined;
    if (record === undefined) {
      throw new NotFoundException(PORTAL_STUDENT_NOT_FOUND_MESSAGE);
    }
    return record;
  }

  private async classTeacher(
    ctx: OrgContext,
    armId: string | null
  ): Promise<string | null> {
    if (armId === null) {
      return null;
    }
    const teachers = await this.portal.classTeachers(ctx.organizationId, armId);
    return orderTeachers(teachers)[0]?.name ?? null;
  }
}
