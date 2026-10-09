import type { INestApplicationContext } from '@nestjs/common';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { CampusService } from '../../src/app/modules/campus/campus.service';
import { StudentService } from '../../src/app/modules/student/student.service';
import { orgContextFor } from './actors';
import { emailOf } from './members';
import { schools } from './schools';
import { students } from './students';

// Until class scope narrows teachers to their arms, Emeka sees all of Lekki.
export const visibleStudents: Record<string, number> = {
  funmi: 28,
  tunde: 28,
  grace: 28,
  chika: 23,
  yemi: 5,
  emeka: 23,
  kola: 0,
};

export async function runSeedCheck(
  app: INestApplicationContext
): Promise<string[]> {
  const failures: string[] = [];
  const check = (label: string, actual: number, expected: number) => {
    if (actual !== expected) {
      failures.push(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const organizations = await db
    .selectFrom('organization')
    .select('slug')
    .execute();
  check('schools', organizations.length, schools.length);

  const campusService = app.get(CampusService, { strict: false });
  const studentService = app.get(StudentService, { strict: false });

  const funmi = await orgContextFor(app, emailOf('funmi'));
  const campuses = await campusService.list(funmi);
  check('Greenfield campuses', campuses.length, 2);
  for (const campus of campuses) {
    const expected = students.filter((s) => s.campus === campus.name).length;
    const listed = await studentService.list(funmi, campus.id);
    check(`${campus.name} students`, listed.length, expected);
  }

  for (const [key, expected] of Object.entries(visibleStudents)) {
    const ctx = await orgContextFor(app, emailOf(key));
    const listed = await studentService.list(ctx);
    check(`${key} sees students`, listed.length, expected);
  }
  return failures;
}
