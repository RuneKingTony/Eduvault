import type { INestApplicationContext } from '@nestjs/common';
import type { LevelSubjectKind } from '@eduvault/api-contract';
import type { OrgContext } from '../../src/app/common/auth';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { ClassLevelService } from '../../src/app/modules/class/class-level.service';
import { ClassService } from '../../src/app/modules/class/class.service';
import { SubjectTeacherService } from '../../src/app/modules/subject/subject-teacher.service';
import { SubjectService } from '../../src/app/modules/subject/subject.service';
import { shiftDate } from './date-shift';

interface SeedSubject {
  code: string;
  name: string;
}

interface SeedLevelSubject {
  subject: string;
  kind: LevelSubjectKind;
}

interface SeedSubjectTeacher {
  persona: string;
  subject: string;
  className: string;
}

export const SEED_SUBJECTS: readonly SeedSubject[] = [
  { code: 'MTH', name: 'Mathematics' },
  { code: 'ENG', name: 'English Language' },
  { code: 'BSC', name: 'Basic Science' },
  { code: 'SST', name: 'Social Studies' },
  { code: 'CVE', name: 'Civic Education' },
  { code: 'FRE', name: 'French' },
  { code: 'PHY', name: 'Physics' },
  { code: 'LIT', name: 'Literature in English' },
  { code: 'QR', name: 'Quantitative Reasoning' },
  { code: 'AGR', name: 'Agricultural Science' },
];

export const RETIRED_SUBJECT = { code: 'AGR', on: '2025-07-20' };

const JSS_LIST: readonly SeedLevelSubject[] = [
  { subject: 'MTH', kind: 'core' },
  { subject: 'ENG', kind: 'core' },
  { subject: 'BSC', kind: 'core' },
  { subject: 'SST', kind: 'core' },
  { subject: 'CVE', kind: 'core' },
  { subject: 'FRE', kind: 'elective' },
];

export const SEED_LEVEL_SUBJECTS: Readonly<
  Record<string, readonly SeedLevelSubject[]>
> = {
  'JSS 1': JSS_LIST,
  'JSS 2': JSS_LIST,
  'JSS 3': JSS_LIST,
  'Primary 4': [
    { subject: 'MTH', kind: 'core' },
    { subject: 'ENG', kind: 'core' },
    { subject: 'QR', kind: 'core' },
  ],
  'SS 1': [
    { subject: 'MTH', kind: 'core' },
    { subject: 'ENG', kind: 'core' },
    { subject: 'PHY', kind: 'elective' },
    { subject: 'LIT', kind: 'elective' },
  ],
};

export const CURRENT_SUBJECT_TEACHERS: readonly SeedSubjectTeacher[] = [
  { persona: 'emeka', subject: 'MTH', className: 'JSS 2 Gold' },
  { persona: 'emeka', subject: 'MTH', className: 'JSS 3 Gold' },
  { persona: 'ayo', subject: 'ENG', className: 'JSS 2 Gold' },
  { persona: 'ayo', subject: 'ENG', className: 'JSS 2 Silver' },
  { persona: 'ayo', subject: 'ENG', className: 'Primary 4 Blue' },
  { persona: 'uche', subject: 'BSC', className: 'JSS 2 Gold' },
  { persona: 'uche', subject: 'BSC', className: 'JSS 2 Silver' },
  { persona: 'claire', subject: 'FRE', className: 'JSS 2 Gold' },
  { persona: 'claire', subject: 'FRE', className: 'JSS 3 Gold' },
];

const FRENCH_TAKERS: readonly string[] = ['Ada', 'Zainab', 'Ifeoma', 'Ruth'];

const found = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) {
    throw new Error(`Seed has no ${what}`);
  }
  return value;
};

async function seedCatalogue(
  app: INestApplicationContext,
  owner: OrgContext,
  offsetDays: number
): Promise<Map<string, string>> {
  const subjects = app.get(SubjectService, { strict: false });
  const ids = new Map<string, string>();
  for (const subject of SEED_SUBJECTS) {
    const created = await subjects.create(owner, subject);
    ids.set(subject.code, created.id);
  }
  const retired = found(ids.get(RETIRED_SUBJECT.code), 'retired subject');
  await subjects.update(owner, retired, { retired: true });
  await app
    .get<Database>(KYSELY_TOKEN, { strict: false })
    .updateTable('subject')
    .set({
      retired_at: `${shiftDate(RETIRED_SUBJECT.on, offsetDays)}T09:00:00Z`,
    })
    .where('id', '=', retired)
    .execute();
  return ids;
}

async function seedLevelLists(
  app: INestApplicationContext,
  owner: OrgContext,
  subjectIds: ReadonlyMap<string, string>
): Promise<void> {
  const levels = await app
    .get(ClassLevelService, { strict: false })
    .list(owner);
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  for (const [levelName, list] of Object.entries(SEED_LEVEL_SUBJECTS)) {
    const level = found(
      levels.find((candidate) => candidate.name === levelName),
      `level ${levelName}`
    );
    await db
      .insertInto('level_subject')
      .values(
        list.map((entry, index) => ({
          organization_id: owner.organizationId,
          class_level_id: level.id,
          subject_id: found(subjectIds.get(entry.subject), entry.subject),
          kind: entry.kind,
          sequence: index + 1,
        }))
      )
      .execute();
  }
}

async function seedFrenchElectives(
  db: Database,
  owner: OrgContext,
  frenchId: string
): Promise<void> {
  const enrolments = await db
    .selectFrom('student_enrollment')
    .innerJoin('student', 'student.id', 'student_enrollment.student_id')
    .innerJoin('level_subject', (join) =>
      join
        .onRef(
          'level_subject.class_level_id',
          '=',
          'student_enrollment.class_level_id'
        )
        .on('level_subject.subject_id', '=', frenchId)
    )
    .where('student_enrollment.organization_id', '=', owner.organizationId)
    .where('student.first_name', 'in', [...FRENCH_TAKERS])
    .select('student_enrollment.id')
    .execute();
  if (enrolments.length === 0) {
    return;
  }
  await db
    .insertInto('student_subject')
    .values(
      enrolments.map((row) => ({
        organization_id: owner.organizationId,
        enrollment_id: row.id,
        subject_id: frenchId,
      }))
    )
    .execute();
}

export async function seedSubjects(
  app: INestApplicationContext,
  options: {
    owner: OrgContext;
    userIds: ReadonlyMap<string, string>;
    offsetDays: number;
  }
): Promise<void> {
  const { owner, userIds, offsetDays } = options;
  const subjectIds = await seedCatalogue(app, owner, offsetDays);
  await seedLevelLists(app, owner, subjectIds);
  await seedFrenchElectives(
    app.get<Database>(KYSELY_TOKEN, { strict: false }),
    owner,
    found(subjectIds.get('FRE'), 'French')
  );

  const classes = await app
    .get(ClassService, { strict: false })
    .list(owner, { status: 'all' });
  const teachers = app.get(SubjectTeacherService, { strict: false });
  for (const row of CURRENT_SUBJECT_TEACHERS) {
    await teachers.assign(
      owner,
      {
        classId: found(
          classes.find((candidate) => candidate.displayName === row.className),
          `class ${row.className}`
        ).id,
        subjectId: found(subjectIds.get(row.subject), row.subject),
      },
      { userId: found(userIds.get(row.persona), `persona ${row.persona}`) }
    );
  }
}
