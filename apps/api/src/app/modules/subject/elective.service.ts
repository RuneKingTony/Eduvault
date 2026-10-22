import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ELECTIVE_STUDENT_NOT_FOUND_MESSAGE,
  SUBJECT_NOT_FOUND_MESSAGE,
  SUBJECT_SESSION_NOT_FOUND_MESSAGE,
  electiveStudentNotEnrolledMessage,
  subjectNotElectiveMessage,
  type contract,
  type ElectiveList,
  type ElectiveTakers,
  type RouteBody,
  type RouteQuery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { SchoolLock } from '../../common/db/school-lock';
import {
  SubjectRepository,
  type ElectiveStudentRecord,
  type SessionRecord,
} from './subject.repository';
import { campusClassScopeOf } from '../../common/scope';

type ListQuery = RouteQuery<typeof contract.electives.list>;
type SetBody = RouteBody<typeof contract.electives.set>;

const sessionNotFound = () =>
  new NotFoundException(SUBJECT_SESSION_NOT_FOUND_MESSAGE);

@Injectable()
export class ElectiveService {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly lock: SchoolLock
  ) {}

  private async sessionFor(
    ctx: OrgContext,
    sessionId: string | undefined
  ): Promise<SessionRecord | undefined> {
    const id =
      sessionId ?? (await this.subjects.currentSessionId(ctx.organizationId));
    if (id === undefined) {
      return undefined;
    }
    const session = await this.subjects.findSession(ctx.organizationId, id);
    if (session === undefined) {
      throw sessionNotFound();
    }
    return session;
  }

  async list(ctx: OrgContext, query: ListQuery): Promise<ElectiveList> {
    const organizationId = ctx.organizationId;
    const session = await this.sessionFor(ctx, query.sessionId);
    if (session === undefined) {
      return { session: null, electives: [], students: [] };
    }
    const [levels, visible] = await Promise.all([
      this.subjects.electiveLevels(organizationId),
      this.subjects.visibleElectiveStudents(
        organizationId,
        campusClassScopeOf(ctx),
        {
          sessionId: session.id,
        }
      ),
    ]);
    const students = visible.flatMap(
      ({ enrollmentId, classLevelId, ...student }) =>
        enrollmentId === null || classLevelId === null
          ? []
          : [{ enrollmentId, classLevelId, ...student }]
    );
    const takers = await this.subjects.electiveTakers(
      organizationId,
      session.id,
      students.map((student) => student.enrollmentId)
    );
    const studentOf = new Map(
      students.map((student) => [student.enrollmentId, student.studentId])
    );
    const subjectIds = [...new Set(levels.map((level) => level.subjectId))];
    return {
      session: { id: session.id, name: session.name },
      electives: subjectIds.map((subjectId) => ({
        subjectId,
        studentIds: takers
          .filter((taker) => taker.subjectId === subjectId)
          .flatMap((taker) => studentOf.get(taker.enrollmentId) ?? []),
      })),
      students: students.map((student) => ({
        id: student.studentId,
        name: student.name,
        admissionNumber: student.admissionNumber,
        classId: student.classId,
        className: student.className,
        classLevelId: student.classLevelId,
      })),
    };
  }

  set(
    ctx: OrgContext,
    subjectId: string,
    body: SetBody
  ): Promise<ElectiveTakers> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      const [[subject], session, levels] = await Promise.all([
        this.subjects.subjectsByIds(organizationId, [subjectId]),
        this.subjects.findSession(organizationId, body.sessionId),
        this.subjects.electiveLevels(organizationId),
      ]);
      if (subject === undefined) {
        throw new NotFoundException(SUBJECT_NOT_FOUND_MESSAGE);
      }
      if (session === undefined) {
        throw sessionNotFound();
      }
      const scope = campusClassScopeOf(ctx);
      const listed = await this.subjects.visibleElectiveStudents(
        organizationId,
        scope,
        { sessionId: body.sessionId, studentIds: body.studentIds }
      );
      if (listed.length < body.studentIds.length) {
        throw new NotFoundException(ELECTIVE_STUDENT_NOT_FOUND_MESSAGE);
      }
      const onLevels = new Set(
        levels
          .filter((level) => level.subjectId === subjectId)
          .map((level) => level.classLevelId)
      );
      const enrollmentIds = listed.map((student) =>
        requireTaker(student, subject.name, onLevels)
      );
      const visible = await this.subjects.visibleElectiveStudents(
        organizationId,
        scope,
        { sessionId: body.sessionId }
      );
      await this.subjects.setElectiveTakers(organizationId, {
        subjectId,
        enrollmentIds,
        visibleEnrollmentIds: visible.flatMap(
          (student) => student.enrollmentId ?? []
        ),
      });
      return { subjectId, studentIds: body.studentIds };
    });
  }
}

function requireTaker(
  student: ElectiveStudentRecord,
  subjectName: string,
  onLevels: ReadonlySet<string>
): string {
  if (student.enrollmentId === null || student.classLevelId === null) {
    throw new BadRequestException(
      electiveStudentNotEnrolledMessage(student.name)
    );
  }
  if (!onLevels.has(student.classLevelId)) {
    throw new BadRequestException(
      subjectNotElectiveMessage(student.name, subjectName)
    );
  }
  return student.enrollmentId;
}
