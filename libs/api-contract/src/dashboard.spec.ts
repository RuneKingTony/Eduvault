import {
  activityQuerySchema,
  dashboardTaskSchema,
  myClassSchema,
} from './dashboard';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const person = (n: number) => ({ id: id(n), name: `Student ${n}` });

describe('dashboardTaskSchema', () => {
  it.each([
    { kind: 'dueLeft', count: 1, students: [person(1)] },
    {
      kind: 'notSeen',
      count: 1,
      students: [{ ...person(1), notSeenSince: '2026-09-01' }],
    },
    {
      kind: 'notInClass',
      count: 1,
      students: [person(1)],
      startYear: { name: '2027/2028' },
    },
    { kind: 'notInClass', count: 1, students: [], startYear: null },
    { kind: 'noClassTeacher', count: 1, classes: [person(1)] },
    { kind: 'announcementDrafts', count: 2, titles: ['PTA', 'Sports day'] },
    { kind: 'noRole', memberId: id(1), name: 'Ada Obi' },
  ])('parses a $kind task', (task) => {
    expect(dashboardTaskSchema.parse(task)).toEqual(task);
  });

  it('rejects an unknown kind', () => {
    expect(
      dashboardTaskSchema.safeParse({ kind: 'owed', count: 1 }).success
    ).toBe(false);
  });

  it('rejects a sample list over five', () => {
    const students = [1, 2, 3, 4, 5, 6].map((n) => person(n));
    expect(
      dashboardTaskSchema.safeParse({ kind: 'dueLeft', count: 6, students })
        .success
    ).toBe(false);
    expect(
      myClassSchema.safeParse({
        armId: id(9),
        name: 'JSS 1A',
        campusName: 'Lekki',
        studentCount: 6,
        isClassTeacher: true,
        subjects: [],
        sampleStudents: students,
      }).success
    ).toBe(false);
  });
});

describe('myClassSchema', () => {
  it('takes a subject-teacher row that is not a class teacher, with its subjects', () => {
    const parsed = myClassSchema.safeParse({
      armId: id(9),
      name: 'JSS 2 Gold',
      campusName: 'Lekki',
      studentCount: 0,
      isClassTeacher: false,
      subjects: ['Mathematics', 'English Language'],
      sampleStudents: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.subjects).toEqual(['Mathematics', 'English Language']);
  });
});

describe('activityQuerySchema', () => {
  it('defaults to page 1, coerces the string and refuses page 0', () => {
    expect(activityQuerySchema.parse({})).toEqual({ page: 1 });
    expect(activityQuerySchema.parse({ page: '2' })).toEqual({ page: 2 });
    expect(activityQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});
