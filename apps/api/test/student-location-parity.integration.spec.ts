import { sql } from 'kysely';
import { currentCampusSql } from '../src/app/common/students/current-campus';
import { visibleStudentsCte } from '../src/app/common/students/visible-students';
import { KYSELY_TOKEN, type Database } from '../src/app/common/db/tokens';
import { expect } from './support/base-test';
import { createClass } from './support/factories/classes';
import { createStudent } from './support/factories/students';
import { makeCurrent, termOf } from './support/factories/terms';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

const YEAR = '2026/2027';

test.describe('where a student is now', () => {
  test('the student lists and the finance scope put every student on the same campus', async ({
    api,
    app,
    schools: { owner, orgA, lekki, ikeja, studentLekki, studentIkeja },
  }) => {
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const campuses = async () => {
      const { rows } = await sql<{
        id: string;
        listed: string;
        finance: string;
      }>`
        WITH ${visibleStudentsCte({
          organizationId: orgA.id,
          campusScope: 'all',
          classScope: 'all',
          today: '2026-10-19',
        })}
        SELECT s.id, v.campus_id AS listed, ${currentCampusSql('s')} AS finance
        FROM student s
        JOIN visible v ON v.id = s.id
        WHERE s.organization_id = ${orgA.id}`.execute(db);
      return new Map(rows.map((row) => [row.id, row]));
    };
    const second = await termOf(api, owner, { year: YEAR, sequence: 2 });
    const target = await createClass(app, owner, { campusId: ikeja.id });
    const placedLater = await createStudent(app, owner, {
      campusId: lekki.id,
    });
    await api(owner)
      .post(`/students/${studentLekki.id}/placements`)
      .send({ termId: second.id, classArmId: target.id })
      .expect(201);

    const first = await campuses();
    expect(first.get(studentLekki.id)).toMatchObject({
      listed: lekki.id,
      finance: lekki.id,
    });
    expect(first.get(studentIkeja.id)).toMatchObject({
      listed: ikeja.id,
      finance: ikeja.id,
    });

    await makeCurrent(api, owner, { year: YEAR, sequence: 2 });

    const next = await campuses();
    expect(next.get(studentLekki.id)).toMatchObject({
      listed: ikeja.id,
      finance: ikeja.id,
    });
    expect(next.get(studentIkeja.id)).toMatchObject({
      listed: ikeja.id,
      finance: ikeja.id,
    });
    expect(next.get(placedLater.id)).toMatchObject({
      listed: lekki.id,
      finance: lekki.id,
    });
  });
});
