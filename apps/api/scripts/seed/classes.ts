import type { INestApplicationContext } from '@nestjs/common';
import type { ClassTeacherRole } from '@eduvault/api-contract';
import type { OrgContext } from '../../src/app/common/auth';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { ClassLevelService } from '../../src/app/modules/class/class-level.service';
import { ClassRepository } from '../../src/app/modules/class/class.repository';
import { ClassService } from '../../src/app/modules/class/class.service';
import { shiftDate } from './date-shift';

interface SeedClass {
  level: string;
  name: string;
  campus: string;
}

interface SeedClassTeacher {
  persona: string;
  level: string;
  name: string;
  role: ClassTeacherRole;
}

const ARCHIVED_CLASS: Pick<SeedClass, 'level' | 'name'> = {
  level: 'JSS 1',
  name: 'Ruby',
};

export const SEED_CLASSES: readonly SeedClass[] = [
  { level: 'Primary 4', name: 'Blue', campus: 'Lekki' },
  { level: 'JSS 1', name: 'Gold', campus: 'Lekki' },
  { level: 'JSS 2', name: 'Gold', campus: 'Lekki' },
  { level: 'JSS 2', name: 'Silver', campus: 'Lekki' },
  { level: 'SS 1', name: 'Science', campus: 'Lekki' },
  { level: 'JSS 3', name: 'Gold', campus: 'Lekki' },
  { level: 'SS 3', name: 'Gold', campus: 'Lekki' },
  { level: 'JSS 2', name: 'Emerald', campus: 'Ikeja' },
  { level: 'SS 1', name: 'Arts', campus: 'Ikeja' },
  { ...ARCHIVED_CLASS, campus: 'Ikeja' },
];

export const CURRENT_CLASS_TEACHERS: readonly SeedClassTeacher[] = [
  { persona: 'ayo', level: 'JSS 2', name: 'Gold', role: 'lead' },
  { persona: 'emeka', level: 'JSS 3', name: 'Gold', role: 'lead' },
  { persona: 'uche', level: 'JSS 2', name: 'Silver', role: 'lead' },
  { persona: 'claire', level: 'Primary 4', name: 'Blue', role: 'lead' },
];

const ARCHIVED_ON = '2026-07-24';

const key = (level: string, name: string): string => `${level} ${name}`;

const found = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) {
    throw new Error(`Seed has no ${what}`);
  }
  return value;
};

export async function seedClasses(
  app: INestApplicationContext,
  options: {
    owner: OrgContext;
    campusIds: ReadonlyMap<string, string>;
    userIds: ReadonlyMap<string, string>;
    offsetDays: number;
  }
): Promise<void> {
  const { owner, campusIds, userIds, offsetDays } = options;
  const classes = app.get(ClassService, { strict: false });
  const levels = await app
    .get(ClassLevelService, { strict: false })
    .list(owner);
  const levelId = (name: string) =>
    found(
      levels.find((level) => level.name === name),
      `level ${name}`
    ).id;
  const campusId = (name: string) =>
    found(campusIds.get(`greenfield/${name}`), `campus ${name}`);

  const created = new Map<string, string>();
  for (const seeded of SEED_CLASSES) {
    const row = await classes.create(owner, {
      levelId: levelId(seeded.level),
      campusId: campusId(seeded.campus),
      name: seeded.name,
    });
    created.set(key(seeded.level, seeded.name), row.id);
  }
  const classId = (level: string, name: string) =>
    found(created.get(key(level, name)), `class ${level} ${name}`);

  await classes.update(
    owner,
    classId(ARCHIVED_CLASS.level, ARCHIVED_CLASS.name),
    {
      archived: true,
    }
  );
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  await db
    .updateTable('class_arm')
    .set({ retired_at: `${shiftDate(ARCHIVED_ON, offsetDays)}T09:00:00Z` })
    .where('id', '=', classId(ARCHIVED_CLASS.level, ARCHIVED_CLASS.name))
    .execute();

  for (const teacher of CURRENT_CLASS_TEACHERS) {
    await classes.assignTeacher(owner, classId(teacher.level, teacher.name), {
      userId: found(userIds.get(teacher.persona), `persona ${teacher.persona}`),
      role: teacher.role,
    });
  }

  const previous = await db
    .selectFrom('academic_session')
    .select('id')
    .where('organization_id', '=', owner.organizationId)
    .orderBy('starts_on')
    .executeTakeFirstOrThrow();
  await app
    .get(ClassRepository, { strict: false })
    .insertTeacher(owner.organizationId, {
      classId: classId('JSS 1', 'Gold'),
      sessionId: previous.id,
      userId: found(userIds.get('ayo'), 'persona ayo'),
      role: 'lead',
      createdBy: owner.user.id,
    });
}
