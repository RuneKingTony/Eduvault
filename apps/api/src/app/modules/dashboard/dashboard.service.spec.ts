import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { NewSchoolYearService } from '../student/new-school-year.service';
import { DashboardService } from './dashboard.service';
import { FakeDashboardRepository } from './fake-dashboard.repository';

const ALL: Permission[] = [
  'student:read',
  'student:archive',
  'student:markAway',
  'enrollment:place',
  'class:assignTeacher',
  'member:update',
];

const ctxFor = (permissions: Permission[]) =>
  ({
    organizationId: 'school-a',
    user: { id: 'caller', email: 'c@eduvault.test', name: 'Tunde Bakare' },
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
    classScope: 'all',
  }) as OrgContext;

const person = (n: number) => ({ id: `s${n}`, name: `Student ${n}` });

const setup = (offer: { targetYearId: string; name: string } | null = null) => {
  const repository = new FakeDashboardRepository();
  repository.due = { count: 1, samples: [person(1)] };
  repository.away = {
    count: 1,
    samples: [{ ...person(2), notSeenSince: '2026-09-01' }],
  };
  repository.unplaced = {
    count: 1,
    samples: [person(3)],
    withoutCurrentYearEnrolment: 0,
  };
  repository.unled = { count: 1, samples: [person(4)] };
  repository.roleless = [{ memberId: 'm1', name: 'Ada Obi' }];
  const offerYear = vi.fn(() => Promise.resolve(offer));
  const clock = new Clock();
  clock.set('2026-10-11');
  const service = new DashboardService(
    repository,
    { offer: offerYear } as unknown as NewSchoolYearService,
    clock
  );
  return { repository, service, offerYear };
};

const kinds = (tasks: { kind: string }[]) => tasks.map(({ kind }) => kind);

describe('DashboardService.tasks', () => {
  it('answers nothing, and queries nothing, without a permission', async () => {
    const { repository, service } = setup();
    expect(await service.tasks(ctxFor([]))).toEqual([]);
    expect(repository.calls).toEqual([]);
  });

  it.each([
    ['student:archive', 'dueLeft'],
    ['student:markAway', 'notSeen'],
    ['enrollment:place', 'notInClass'],
  ] as [Permission, string][])(
    'shows %s tasks only together with student:read: %s',
    async (permission, kind) => {
      const { service } = setup();
      expect(await service.tasks(ctxFor([permission]))).toEqual([]);
      expect(
        kinds(await service.tasks(ctxFor(['student:read', permission])))
      ).toEqual([kind]);
    }
  );

  it.each([
    ['class:assignTeacher', 'noClassTeacher'],
    ['member:update', 'noRole'],
  ] as [Permission, string][])(
    'shows %s tasks only with the permission: %s',
    async (permission, kind) => {
      const { service } = setup();
      expect(kinds(await service.tasks(ctxFor([permission])))).toEqual([kind]);
    }
  );

  it('keeps the order dueLeft, notSeen, notInClass, noClassTeacher, noRole', async () => {
    const { service } = setup();
    expect(kinds(await service.tasks(ctxFor(ALL.toReversed())))).toEqual([
      'dueLeft',
      'notSeen',
      'notInClass',
      'noClassTeacher',
      'noRole',
    ]);
  });

  it('drops a task whose count is zero', async () => {
    const { repository, service } = setup();
    repository.due = { count: 0, samples: [] };
    repository.roleless = [];
    expect(kinds(await service.tasks(ctxFor(ALL)))).toEqual([
      'notSeen',
      'notInClass',
      'noClassTeacher',
    ]);
  });

  it('lists one noRole task per member', async () => {
    const { repository, service } = setup();
    repository.roleless = [
      { memberId: 'm1', name: 'Ada Obi' },
      { memberId: 'm2', name: 'Bayo Ade' },
    ];
    expect(await service.tasks(ctxFor(['member:update']))).toEqual([
      { kind: 'noRole', memberId: 'm1', name: 'Ada Obi' },
      { kind: 'noRole', memberId: 'm2', name: 'Bayo Ade' },
    ]);
  });

  it('skips the class tasks with no current term', async () => {
    const { repository, service } = setup();
    repository.currentTerm = false;
    expect(kinds(await service.tasks(ctxFor(ALL)))).toEqual([
      'dueLeft',
      'notSeen',
      'noRole',
    ]);
    expect(repository.calls).not.toContain('notInClass');
    expect(repository.calls).not.toContain('noClassTeacher');
  });

  it('passes the caller scopes and the school date to the repository', async () => {
    const { repository, service } = setup();
    await service.tasks(ctxFor(['student:read', 'student:markAway']));
    expect(repository.scopes).toEqual([
      {
        organizationId: 'school-a',
        campusScope: 'all',
        classScope: 'all',
        today: '2026-10-11',
      },
    ]);
  });
});

describe('DashboardService.tasks startYear', () => {
  const offer = { targetYearId: 'y27', name: '2027/2028' };
  const placer = ctxFor(['student:read', 'enrollment:place']);

  it('is set when the offer exists and a student lacks a current-year enrolment', async () => {
    const { repository, service } = setup(offer);
    repository.unplaced = {
      ...repository.unplaced,
      withoutCurrentYearEnrolment: 1,
    };
    expect(await service.tasks(placer)).toEqual([
      {
        kind: 'notInClass',
        count: 1,
        students: [person(3)],
        startYear: { name: '2027/2028' },
      },
    ]);
  });

  it('is null when every student already has a current-year enrolment', async () => {
    const { service, offerYear } = setup(offer);
    const [task] = await service.tasks(placer);
    expect(task).toMatchObject({ kind: 'notInClass', startYear: null });
    expect(offerYear).not.toHaveBeenCalled();
  });

  it('is null when there is no offer', async () => {
    const { repository, service } = setup(null);
    repository.unplaced = {
      ...repository.unplaced,
      withoutCurrentYearEnrolment: 1,
    };
    const [task] = await service.tasks(placer);
    expect(task).toMatchObject({ kind: 'notInClass', startYear: null });
  });
});

describe('DashboardService.roll and myClasses', () => {
  it('reads the roll and the classes through the caller scope', async () => {
    const { repository, service } = setup();
    repository.classes = [
      {
        armId: 'a1',
        name: 'JSS 1A',
        campusName: 'Lekki',
        studentCount: 1,
        isClassTeacher: true,
        subjects: [],
        sampleStudents: [person(1)],
      },
    ];
    expect(await service.roll(ctxFor([]))).toEqual(repository.rollCounts);
    expect(await service.myClasses(ctxFor([]))).toEqual(repository.classes);
    expect(repository.calls).toEqual(['roll', 'myClasses']);
  });
});
