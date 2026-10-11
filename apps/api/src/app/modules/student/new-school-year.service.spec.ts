import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { StartNewSchoolYearInput } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { SchoolLock } from '../../common/db/school-lock';
import { FakeNewSchoolYearRepository } from './fake-new-school-year.repository';
import type { RowLevelFacts, StudentRowFacts } from './new-school-year';
import { NewSchoolYearService } from './new-school-year.service';

const ctxFor = (
  permissions: Permission[],
  campusScope: OrgContext['campusScope'] = 'all'
) =>
  ({
    organizationId: 'school-a',
    user: { id: 'caller', email: 'c@eduvault.test', name: 'Tunde Bakare' },
    permissions: toPermissionMap(permissions),
    campusScope,
    classScope: 'all',
  }) as OrgContext;

const placer = ctxFor(['enrollment:place']);
const placerAndArchiver = ctxFor(['enrollment:place', 'student:archive']);

const years = [
  {
    id: 'y26',
    name: '2026/2027',
    startsOn: '2026-09-07',
    endsOn: '2027-07-23',
  },
  {
    id: 'y27',
    name: '2027/2028',
    startsOn: '2027-09-06',
    endsOn: '2028-07-21',
  },
];

const lastTerm = {
  currentTerm: { termId: 'term-3', sessionId: 'y26', sequence: 3 },
  lastSequence: 3,
  years,
};

const jss2: RowLevelFacts = {
  levelId: 'j2',
  levelName: 'JSS 2',
  nextLevelId: 'j3',
  nextLevelName: 'JSS 3',
};
const ss3: RowLevelFacts = {
  levelId: 'ss3',
  levelName: 'SS 3',
  nextLevelId: null,
  nextLevelName: null,
};

const student = (
  id: string,
  overrides: Partial<StudentRowFacts> = {}
): StudentRowFacts => ({
  studentId: id,
  userId: null,
  name: `Student ${id}`,
  campusId: 'lekki',
  life: 'active',
  inTarget: false,
  level: jss2,
  ...overrides,
});

function setup() {
  const repository = new FakeNewSchoolYearRepository();
  repository.calendarFacts = lastTerm;
  repository.arms = [
    {
      id: 'j3-gold',
      levelId: 'j3',
      display: 'JSS 3 Gold',
      retired: false,
      campusId: 'lekki',
    },
    {
      id: 'j2-gold',
      levelId: 'j2',
      display: 'JSS 2 Gold',
      retired: false,
      campusId: 'lekki',
    },
  ];
  repository.students = [
    student('1'),
    student('2'),
    student('3', { level: ss3 }),
  ];
  const clock = new Clock();
  clock.set('2026-10-11');
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  return {
    repository,
    service: new NewSchoolYearService(
      repository,
      lock as unknown as SchoolLock,
      clock
    ),
  };
}

const body = (
  rows: StartNewSchoolYearInput['rows'],
  targetYearId = 'y27'
): StartNewSchoolYearInput => ({ targetYearId, rows });

const rows: StartNewSchoolYearInput['rows'] = [
  { studentId: '1', outcome: 'move', classArmId: 'j3-gold' },
  { studentId: '2', outcome: 'repeat', classArmId: 'j2-gold' },
  { studentId: '3', outcome: 'graduate' },
];

describe('NewSchoolYearService.preview', () => {
  it('names the target and leaving years with the first term', async () => {
    const { service } = setup();
    const preview = await service.preview(placerAndArchiver);
    expect(preview).toMatchObject({
      targetYear: {
        id: 'y27',
        name: '2027/2028',
        firstTerm: { id: 'term-4', name: 'First term', isCurrent: false },
      },
      leavingYear: { id: 'y26', name: '2026/2027' },
      canGraduate: true,
      alreadyInTargetYear: 0,
      groups: [],
    });
  });

  it('only lets a holder of student:archive graduate', async () => {
    const { service } = setup();
    expect((await service.preview(placer)).canGraduate).toBe(false);
  });

  it('reads through the caller’s campus scope', async () => {
    const { service, repository } = setup();
    await service.preview(ctxFor(['enrollment:place'], ['lekki']));
    expect(repository.scopes).toEqual([['lekki']]);
  });

  it('answers 409 when no school year follows', async () => {
    const { service, repository } = setup();
    repository.calendarFacts = { ...lastTerm, years: [years[0]!] };
    await expect(service.preview(placer)).rejects.toThrow(
      new ConflictException(
        'There is no school year to start. Create the next school year first.'
      )
    );
  });

  it('answers 409 in a middle term and with no current term', async () => {
    const { service, repository } = setup();
    repository.calendarFacts = {
      ...lastTerm,
      currentTerm: { termId: 'term-2', sessionId: 'y26', sequence: 2 },
    };
    await expect(service.preview(placer)).rejects.toThrow(ConflictException);
    repository.calendarFacts = undefined;
    await expect(service.preview(placer)).rejects.toThrow(ConflictException);
  });
});

describe('NewSchoolYearService.offer', () => {
  it('is offered to a placer while someone in scope is waiting', async () => {
    const { service, repository } = setup();
    repository.waitingCount = 3;
    await expect(service.offer(placer)).resolves.toEqual({
      targetYearId: 'y27',
      name: '2027/2028',
    });
  });

  it('is hidden without enrollment:place, with nobody waiting or with no target', async () => {
    const { service, repository } = setup();
    repository.waitingCount = 3;
    await expect(service.offer(ctxFor(['student:read']))).resolves.toBeNull();
    repository.waitingCount = 0;
    await expect(service.offer(placer)).resolves.toBeNull();
    repository.waitingCount = 3;
    repository.calendarFacts = { ...lastTerm, years: [years[0]!] };
    await expect(service.offer(placer)).resolves.toBeNull();
  });
});

describe('NewSchoolYearService.start', () => {
  it('writes movers, repeaters and graduates in one go', async () => {
    const { service, repository } = setup();
    await expect(service.start(placerAndArchiver, body(rows))).resolves.toEqual(
      { moved: 1, repeating: 1, graduated: 1, skipped: 0 }
    );
    expect(repository.written).toHaveLength(1);
    expect(repository.written[0]).toMatchObject({
      leavingYear: { id: 'y26' },
      targetYear: { id: 'y27', firstTermId: 'term-4' },
      currentTerm: { termId: 'term-3', sessionId: 'y26' },
    });
    expect(repository.written[0]?.enrolments.map((row) => row.levelId)).toEqual(
      ['j3', 'j2']
    );
  });

  it('counts students already enrolled or archived as skipped', async () => {
    const { service, repository } = setup();
    repository.students = [
      student('1', { inTarget: true }),
      student('2', { life: 'left' }),
      student('3', { level: ss3 }),
    ];
    await expect(service.start(placerAndArchiver, body(rows))).resolves.toEqual(
      { moved: 0, repeating: 0, graduated: 1, skipped: 2 }
    );
  });

  it('counts an enrolment the database refused as skipped', async () => {
    const { service, repository } = setup();
    repository.conflicts = 1;
    await expect(
      service.start(placerAndArchiver, body(rows.slice(0, 2)))
    ).resolves.toEqual({ moved: 1, repeating: 0, graduated: 0, skipped: 1 });
  });

  it('answers 403 and writes nothing for a graduate row without student:archive', async () => {
    const { service, repository } = setup();
    await expect(service.start(placer, body(rows))).rejects.toThrow(
      ForbiddenException
    );
    expect(repository.written).toEqual([]);
  });

  it('answers 409 when the year is not the target and 404 when it is not the school’s', async () => {
    const { service, repository } = setup();
    await expect(
      service.start(placer, body(rows.slice(0, 1), 'y26'))
    ).rejects.toThrow(
      new ConflictException('That is not the school year to start now.')
    );
    await expect(
      service.start(placer, body(rows.slice(0, 1), 'other-school-year'))
    ).rejects.toThrow(new NotFoundException('School year not found'));
    expect(repository.written).toEqual([]);
  });

  it('answers 409 with no current term', async () => {
    const { service, repository } = setup();
    repository.calendarFacts = undefined;
    await expect(service.start(placer, body(rows.slice(0, 1)))).rejects.toThrow(
      new ConflictException(
        'Make a term current before starting a school year.'
      )
    );
  });

  it('answers 404 for a student outside the caller’s scope', async () => {
    const { service, repository } = setup();
    repository.students = [student('2')];
    await expect(service.start(placer, body(rows.slice(0, 2)))).rejects.toThrow(
      new NotFoundException('Student not found')
    );
    expect(repository.written).toEqual([]);
  });

  it('answers 404 for a class outside the school', async () => {
    const { service, repository } = setup();
    repository.arms = [];
    await expect(service.start(placer, body(rows.slice(0, 1)))).rejects.toThrow(
      new NotFoundException('Class not found')
    );
  });

  it('writes nothing when one row names a class at the wrong level', async () => {
    const { service, repository } = setup();
    await expect(
      service.start(
        placer,
        body([
          rows[0]!,
          { studentId: '2', outcome: 'move', classArmId: 'j2-gold' },
        ])
      )
    ).rejects.toThrow(new BadRequestException('Choose a JSS 3 class.'));
    expect(repository.written).toEqual([]);
  });

  it('refuses a student listed twice with 400', async () => {
    const { service } = setup();
    await expect(
      service.start(placer, body([rows[0]!, rows[0]!]))
    ).rejects.toThrow(new BadRequestException('List each student once.'));
  });
});
