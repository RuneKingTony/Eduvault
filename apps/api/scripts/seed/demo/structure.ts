import type { INestApplicationContext } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import {
  AccountService,
  type AppAuth,
  type AuthenticatedUser,
} from '../../../src/app/common/auth';
import { castToBetterAuthRoles } from '../../../src/app/common/auth/better-auth-roles';
import { KYSELY_TOKEN, type Database } from '../../../src/app/common/db/tokens';
import { CalendarService } from '../../../src/app/modules/calendar/calendar.service';
import { CampusService } from '../../../src/app/modules/campus/campus.service';
import { ClassLevelService } from '../../../src/app/modules/class/class-level.service';
import { ClassService } from '../../../src/app/modules/class/class.service';
import { PlatformService } from '../../../src/app/modules/platform/platform.service';
import { SubjectTeacherService } from '../../../src/app/modules/subject/subject-teacher.service';
import { SubjectService } from '../../../src/app/modules/subject/subject.service';
import { orgContextFor } from '../actors';
import { shiftDate } from '../date-shift';
import { SEED_PASSWORD } from '../members';
import { DEMO_CAMPUSES, type DemoCampus } from './config';
import {
  dayAt,
  found,
  type AcademicFacts,
  type DemoRun,
  type SchoolFacts,
} from './demo-run';
import { CAMPUS_ADDRESSES, DEMO_SUBJECTS, levelSubjects } from './lists';
import { DEMO_OWNER, DEMO_SCHOOL, type DemoStaff } from './people-plan';

const DAYS_SINCE_SCHOOL_JOINED = 120;
export const TERM_STARTED_DAYS_AGO = 37;
const SCHOOL_YEAR_DAYS = 319;
const WEEKS_BEFORE_MID_TERM = 8;
const MID_TERM_THURSDAY_OFFSET = 3;

async function addStaff(
  run: DemoRun,
  school: Pick<SchoolFacts, 'organizationId' | 'owner' | 'campusIds'>
): Promise<Map<string, string>> {
  const { app, plan } = run;
  const accounts = app.get(AccountService, { strict: false });
  const { api } = app.get(AuthService<AppAuth>, { strict: false });
  const userIds = new Map<string, string>();
  const staff: DemoStaff[] = [...plan.leaders, ...plan.teachers];
  for (const member of staff) {
    const { user } = await accounts.createAccount({
      name: member.name,
      email: member.email,
      password: SEED_PASSWORD,
      mustChangePassword: false,
    });
    userIds.set(member.key, user.id);
    await api.addMember({
      body: {
        userId: user.id,
        organizationId: school.organizationId,
        role: castToBetterAuthRoles(member.roles),
        title: member.title,
      },
    });
    for (const campus of member.campuses) {
      await api.addTeamMember({
        body: {
          teamId: found(school.campusIds.get(campus), `campus ${campus}`),
          userId: user.id,
        },
        headers: school.owner.headers,
      });
    }
  }
  return userIds;
}

export async function createSchool(
  run: DemoRun,
  superAdmin: AuthenticatedUser
): Promise<SchoolFacts> {
  const { app, plan } = run;
  await app.get(AccountService, { strict: false }).createAccount({
    name: DEMO_OWNER.name,
    email: DEMO_OWNER.email,
    password: SEED_PASSWORD,
    mustChangePassword: false,
  });
  const created = await app
    .get(PlatformService, { strict: false })
    .createSchool(superAdmin, {
      name: DEMO_SCHOOL.name,
      slug: DEMO_SCHOOL.slug,
      admissionPrefix: DEMO_SCHOOL.admissionPrefix,
      city: DEMO_SCHOOL.city,
      ownerName: DEMO_OWNER.name,
      ownerEmail: DEMO_OWNER.email,
    });
  const organizationId = created.school.id;
  await app
    .get<Database>(KYSELY_TOKEN, { strict: false })
    .updateTable('organization')
    .set({
      createdAt: `${dayAt(plan, DAYS_SINCE_SCHOOL_JOINED)}T09:00:00Z`,
    })
    .where('id', '=', organizationId)
    .execute();

  const owner = await orgContextFor(app, DEMO_OWNER.email);
  const campuses = app.get(CampusService, { strict: false });
  const campusIds = new Map<DemoCampus, string>();
  for (const name of DEMO_CAMPUSES) {
    const row = await campuses.create(owner, {
      name,
      address: CAMPUS_ADDRESSES[name],
    });
    campusIds.set(name, row.id);
  }
  const userIds = await addStaff(run, { organizationId, owner, campusIds });
  return { organizationId, owner, campusIds, userIds };
}

const yearName = (startsOn: string): string => {
  const year = Number(startsOn.slice(0, 4));
  return `${year}/${year + 1}`;
};

async function createCalendar(
  run: DemoRun,
  school: SchoolFacts
): Promise<string> {
  const calendar = run.app.get(CalendarService, { strict: false });
  const startsOn = dayAt(run.plan, TERM_STARTED_DAYS_AGO);
  const year = await calendar.create(school.owner, {
    name: yearName(startsOn),
    startsOn,
    endsOn: shiftDate(startsOn, SCHOOL_YEAR_DAYS),
  });
  const first = found(
    year.terms.find((term) => term.sequence === 1),
    'first term'
  );
  if (!first.isCurrent) {
    await calendar.makeCurrent(school.owner, first.id);
  }
  const midTerm = shiftDate(
    startsOn,
    WEEKS_BEFORE_MID_TERM * 7 + MID_TERM_THURSDAY_OFFSET
  );
  for (const date of [midTerm, shiftDate(midTerm, 1)]) {
    await calendar.addHoliday(school.owner, first.id, {
      date,
      name: 'Mid-term break',
    });
  }
  return first.id;
}

async function createClasses(
  run: DemoRun,
  school: SchoolFacts
): Promise<string[]> {
  const { app, plan } = run;
  const levels = await app
    .get(ClassLevelService, { strict: false })
    .list(school.owner);
  const classes = app.get(ClassService, { strict: false });
  const armIds: string[] = [];
  for (const arm of plan.arms) {
    const row = await classes.create(school.owner, {
      levelId: found(
        levels.find((level) => level.code === arm.level.code),
        `level ${arm.level.code}`
      ).id,
      campusId: found(school.campusIds.get(arm.campus), arm.campus),
      name: arm.name,
    });
    armIds[arm.index] = row.id;
  }
  for (const teacher of plan.teachers) {
    if (teacher.leadsArm !== null) {
      await classes.assignTeacher(
        school.owner,
        found(armIds[teacher.leadsArm], `class ${teacher.leadsArm}`),
        {
          userId: found(school.userIds.get(teacher.key), teacher.key),
          role: 'lead',
        }
      );
    }
  }
  return armIds;
}

async function createSubjects(
  run: DemoRun,
  school: SchoolFacts,
  armIds: readonly string[]
): Promise<void> {
  const { app, plan } = run;
  const subjects = app.get(SubjectService, { strict: false });
  const subjectIds = new Map<string, string>();
  for (const subject of DEMO_SUBJECTS) {
    const row = await subjects.create(school.owner, subject);
    subjectIds.set(subject.code, row.id);
  }
  await addLevelLists(app, school, subjectIds);
  const teachers = app.get(SubjectTeacherService, { strict: false });
  for (const row of plan.subjectTeachers) {
    const teacher = found(plan.teachers[row.teacher], `teacher ${row.teacher}`);
    await teachers.assign(
      school.owner,
      {
        classId: found(armIds[row.arm], `class ${row.arm}`),
        subjectId: found(subjectIds.get(row.subject), row.subject),
      },
      { userId: found(school.userIds.get(teacher.key), teacher.key) }
    );
  }
}

async function addLevelLists(
  app: INestApplicationContext,
  school: SchoolFacts,
  subjectIds: ReadonlyMap<string, string>
): Promise<void> {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const levels = await app
    .get(ClassLevelService, { strict: false })
    .list(school.owner);
  for (const level of levels) {
    await db
      .insertInto('level_subject')
      .values(
        levelSubjects(level.code).map((entry, index) => ({
          organization_id: school.organizationId,
          class_level_id: level.id,
          subject_id: found(subjectIds.get(entry.subject), entry.subject),
          kind: entry.kind,
          sequence: index + 1,
        }))
      )
      .execute();
  }
}

export async function createAcademics(
  run: DemoRun,
  school: SchoolFacts
): Promise<AcademicFacts> {
  const termId = await createCalendar(run, school);
  const armIds = await createClasses(run, school);
  await createSubjects(run, school, armIds);
  return { termId, armIds };
}
