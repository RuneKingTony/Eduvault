import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PORTAL_STUDENT_NOT_FOUND_MESSAGE,
  type PortalAnnouncements,
  type PortalAnnouncementsQuery,
  type PortalChild,
  type PortalMe,
  type PortalStudent,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { AnnouncementService } from '../announcement/announcement.service';
import { orderTeachers } from '../class/class-view';
import { firstNameOf, portalKindOf, realEmail } from './portal-rules';
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
    private readonly announcements: AnnouncementService
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
    return this.portal.children(scopeOf(ctx));
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
