import type {
  DashboardRoll,
  DashboardTask,
  SchoolYearList,
  StudentDetail,
  StudentList,
} from '@eduvault/api-contract';
import { addDays } from '@eduvault/shared';
import { expect } from './support/base-test';
import { YEAR_2027, createSchoolYear } from './support/factories/calendar';
import { schoolsTest as test } from './support/two-schools';

const BOUNDARIES = [
  { days: 34, life: 'active', dueLeft: false, waiting: 2 },
  { days: 35, life: 'inactive', dueLeft: false, waiting: 1 },
  { days: 132, life: 'inactive', dueLeft: false, waiting: 1 },
  { days: 133, life: 'inactive', dueLeft: true, waiting: 1 },
] as const;

test.describe('the Inactive and Due-to-be-Left rule agrees across every reader', () => {
  for (const boundary of BOUNDARIES) {
    test(`day ${boundary.days} reads ${boundary.life}${boundary.dueLeft ? ' and due to be Left' : ''} on the detail, the list, the dashboard and the calendar`, async ({
      api,
      app,
      clock,
      schools: { owner, studentLekki },
    }) => {
      await createSchoolYear(app, owner, YEAR_2027);
      await api(owner)
        .post(`/students/${studentLekki.id}/not-seen`)
        .send({ date: studentLekki.admittedOn })
        .expect(201);
      clock.set(addDays(studentLekki.admittedOn, boundary.days));

      const detail = (
        await api(owner).get(`/students/${studentLekki.id}`).expect(200)
      ).body as StudentDetail;
      expect(detail).toMatchObject({
        life: boundary.life,
        dueLeft: boundary.dueLeft,
      });

      const list = (
        await api(owner).get(`/students?tab=${boundary.life}`).expect(200)
      ).body as StudentList;
      expect(
        list.items.find((row) => row.id === studentLekki.id)
      ).toMatchObject({ life: boundary.life, dueLeft: boundary.dueLeft });
      expect(list.counts.inactive).toBe(boundary.life === 'inactive' ? 1 : 0);

      const roll = (await api(owner).get('/dashboard/roll').expect(200))
        .body as DashboardRoll;
      expect(roll.inactive).toBe(boundary.life === 'inactive' ? 1 : 0);
      expect(roll.dueLeft).toBe(boundary.dueLeft ? 1 : 0);
      const tasks = (await api(owner).get('/dashboard/tasks').expect(200))
        .body as DashboardTask[];
      expect(tasks.some((task) => task.kind === 'dueLeft')).toBe(
        boundary.dueLeft
      );

      const years = (await api(owner).get('/school-years').expect(200))
        .body as SchoolYearList;
      expect(
        years.items.find((year) => year.name === YEAR_2027.name)
          ?.studentsWaiting
      ).toBe(boundary.waiting);
    });
  }
});
