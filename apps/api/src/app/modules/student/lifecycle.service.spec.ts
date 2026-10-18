import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { toPermissionMap } from '@eduvault/policy';
import type { StudentDetail } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { SchoolLock } from '../../common/db/school-lock';
import { FakeLifecycleRepository } from './fake-lifecycle.repository';
import type { LifecycleStudent } from './lifecycle.repository';
import { LifecycleRunner } from './lifecycle-runner';
import { LifecycleService } from './lifecycle.service';
import type { StudentService } from './student.service';

const TODAY = '2026-10-11';

const ctx = {
  organizationId: 'school-a',
  user: { id: 'caller', email: 'c@eduvault.test', name: 'Tunde Bakare' },
  permissions: toPermissionMap([]),
  campusScope: 'all',
  classScope: 'all',
} as OrgContext;

const onRoll: LifecycleStudent = {
  id: 'st-1',
  firstName: 'Ada',
  lastName: 'Okeke',
  admittedOn: '2026-09-07',
  userId: 'user-ada',
  campusId: 'lekki',
  notSeenSince: null,
  exitKind: null,
  archivedTermId: null,
};

const term = {
  termId: 'term-1',
  termName: 'First term',
  sessionId: 'year-1',
  sessionName: '2026/2027',
};

function setup(student: LifecycleStudent | undefined = onRoll) {
  const repository = new FakeLifecycleRepository();
  repository.tx.student = student;
  repository.tx.term = term;
  const detail = { id: 'st-1' } as StudentDetail;
  const students = {
    assertVisible: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(detail),
  };
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  const clock = new Clock();
  clock.set(TODAY);
  const runner = new LifecycleRunner(
    repository,
    students as unknown as StudentService,
    lock as unknown as SchoolLock
  );
  return {
    tx: repository.tx,
    students,
    detail,
    service: new LifecycleService(runner, clock),
  };
}

const writeNames = (tx: { writes: [string, unknown][] }) =>
  tx.writes.map(([name]) => name);

describe('LifecycleService access', () => {
  it('answers 404 before any rule when the caller cannot see the student', async () => {
    const { service, students, tx } = setup();
    students.assertVisible.mockRejectedValue(new NotFoundException());
    await expect(
      service.markAway(ctx, 'st-1', { date: '2026-10-04' })
    ).rejects.toThrow(NotFoundException);
    expect(tx.writes).toEqual([]);
  });

  it('answers 404 when the student vanishes before the lock', async () => {
    const { service, tx } = setup();
    tx.student = undefined;
    await expect(service.backInSchool(ctx, 'st-1')).rejects.toThrow(
      NotFoundException
    );
  });

  it('returns the detail read through the caller scope', async () => {
    const { service, detail, students } = setup();
    await expect(
      service.markAway(ctx, 'st-1', { date: '2026-10-04' })
    ).resolves.toBe(detail);
    expect(students.get).toHaveBeenCalledWith(ctx, 'st-1');
  });
});

describe('LifecycleService.markAway', () => {
  it('stores the date, the caller and the note and writes the activity', async () => {
    const { service, tx } = setup();
    await service.markAway(ctx, 'st-1', {
      date: '2026-10-04',
      note: 'No answer',
    });
    expect(tx.writes).toEqual([
      [
        'setNotSeen',
        {
          organizationId: 'school-a',
          studentId: 'st-1',
          date: '2026-10-04',
          byUserId: 'caller',
          note: 'No answer',
        },
      ],
    ]);
    expect(tx.activities[0]?.text).toBe(
      'Ada Okeke marked not seen since 4 Oct 2026. Inactive from 8 Nov 2026 if not back.'
    );
  });

  it('says so when the date is 35 days or more ago', async () => {
    const { service, tx } = setup({ ...onRoll, admittedOn: '2026-08-01' });
    await service.markAway(ctx, 'st-1', { date: '2026-09-06' });
    expect(tx.activities[0]?.text).toBe(
      'Ada Okeke marked not seen since 6 Sep 2026. More than 5 weeks, so now Inactive.'
    );
  });

  it('refuses a future date with 400', async () => {
    const { service, tx } = setup();
    await expect(
      service.markAway(ctx, 'st-1', { date: '2026-10-12' })
    ).rejects.toThrow(
      new BadRequestException('Choose a date on or before today.')
    );
    expect(tx.writes).toEqual([]);
  });

  it('refuses a date before admission with 400', async () => {
    const { service } = setup();
    await expect(
      service.markAway(ctx, 'st-1', { date: '2026-09-06' })
    ).rejects.toThrow(
      new BadRequestException('Choose a date on or after 7 Sep 2026.')
    );
  });

  it('refuses a student already marked with 409', async () => {
    const { service } = setup({ ...onRoll, notSeenSince: '2026-10-01' });
    await expect(
      service.markAway(ctx, 'st-1', { date: '2026-10-04' })
    ).rejects.toThrow(
      new ConflictException('Already marked not seen since 1 Oct 2026.')
    );
  });

  it('refuses a student who has left with 409', async () => {
    const { service } = setup({ ...onRoll, exitKind: 'left' });
    await expect(
      service.markAway(ctx, 'st-1', { date: '2026-10-04' })
    ).rejects.toThrow(
      new ConflictException('Ada Okeke is no longer on the roll.')
    );
  });
});

describe('LifecycleService.backInSchool', () => {
  it('clears the marker and notes Active again for an inactive student', async () => {
    const { service, tx } = setup({ ...onRoll, notSeenSince: '2026-08-30' });
    await service.backInSchool(ctx, 'st-1');
    expect(writeNames(tx)).toEqual(['clearNotSeen']);
    expect(tx.activities[0]?.text).toBe(
      'Ada Okeke is back in school and Active again.'
    );
  });

  it('keeps the plain wording for a student who was still active', async () => {
    const { service, tx } = setup({ ...onRoll, notSeenSince: '2026-10-04' });
    await service.backInSchool(ctx, 'st-1');
    expect(tx.activities[0]?.text).toBe('Ada Okeke is back in school.');
  });

  it('refuses an unmarked student with 409', async () => {
    const { service } = setup();
    await expect(service.backInSchool(ctx, 'st-1')).rejects.toThrow(
      ConflictException
    );
  });

  it('refuses an archived student with 409', async () => {
    const { service } = setup({
      ...onRoll,
      notSeenSince: '2026-10-01',
      exitKind: 'graduated',
    });
    await expect(service.backInSchool(ctx, 'st-1')).rejects.toThrow(
      ConflictException
    );
  });
});

describe('LifecycleService.leave', () => {
  const input = {
    reason: 'relocated',
    lastDay: '2026-10-02',
    note: 'Abuja',
  } as const;

  it('records the leaving against the current term and session', async () => {
    const { service, tx } = setup();
    await service.leave(ctx, 'st-1', input);
    expect(tx.writes).toEqual([
      [
        'recordLeaving',
        {
          organizationId: 'school-a',
          studentId: 'st-1',
          userId: 'user-ada',
          actorUserId: 'caller',
          reason: 'relocated',
          lastDay: '2026-10-02',
          note: 'Abuja',
          sessionId: 'year-1',
          termId: 'term-1',
        },
      ],
    ]);
    expect(tx.activities[0]?.text).toBe(
      'Ada Okeke recorded as left: Relocated.'
    );
  });

  it('writes the leaving to the foundation pillar with no money in it', async () => {
    const { service, tx } = setup();
    await service.leave(ctx, 'st-1', input);
    const activity = tx.activities[0];
    expect(activity?.pillar).toBe('foundation');
    expect(activity?.data).toEqual({
      reason: 'relocated',
      lastDay: '2026-10-02',
    });
    expect(activity?.text).not.toMatch(/[\d₦$]|NGN|Balance|Who owes/);
  });

  it('refuses a last day after today with 400', async () => {
    const { service, tx } = setup();
    await expect(
      service.leave(ctx, 'st-1', { ...input, lastDay: '2026-10-12' })
    ).rejects.toThrow(BadRequestException);
    expect(tx.writes).toEqual([]);
  });

  it('refuses a second leave with 409', async () => {
    const { service } = setup({ ...onRoll, exitKind: 'left' });
    await expect(service.leave(ctx, 'st-1', input)).rejects.toThrow(
      ConflictException
    );
  });

  it('refuses with 409 when no term is current', async () => {
    const { service, tx } = setup();
    tx.term = undefined;
    await expect(service.leave(ctx, 'st-1', input)).rejects.toThrow(
      new ConflictException('Make a term current before recording a leaving.')
    );
    expect(tx.writes).toEqual([]);
  });
});

describe('LifecycleService.undoLeaving', () => {
  const left: LifecycleStudent = {
    ...onRoll,
    exitKind: 'left',
    archivedTermId: 'term-1',
  };

  it('restores the student in the term it was recorded', async () => {
    const { service, tx } = setup(left);
    await service.undoLeaving(ctx, 'st-1');
    expect(tx.writes).toEqual([
      [
        'undoArchive',
        { organizationId: 'school-a', studentId: 'st-1', userId: 'user-ada' },
      ],
    ]);
    expect(tx.activities[0]?.text).toBe(
      'Ada Okeke’s leaving was undone by Tunde Bakare.'
    );
  });

  it('calls a graduation by its name', async () => {
    const { service, tx } = setup({ ...left, exitKind: 'graduated' });
    await service.undoLeaving(ctx, 'st-1');
    expect(tx.activities[0]?.text).toBe(
      'Ada Okeke’s graduation was undone by Tunde Bakare.'
    );
  });

  it('refuses once the term has changed with 409', async () => {
    const { service, tx } = setup({ ...left, archivedTermId: 'term-0' });
    await expect(service.undoLeaving(ctx, 'st-1')).rejects.toThrow(
      new ConflictException(
        'A leaving can only be undone in the term it was recorded.'
      )
    );
    expect(tx.writes).toEqual([]);
  });

  it('refuses a graduation after the term changes with the graduation wording', async () => {
    const { service } = setup({
      ...left,
      exitKind: 'graduated',
      archivedTermId: 'term-0',
    });
    await expect(service.undoLeaving(ctx, 'st-1')).rejects.toThrow(
      'A graduation can only be undone in the term it was recorded.'
    );
  });

  it('refuses a student who is still on the roll with 409', async () => {
    const { service } = setup();
    await expect(service.undoLeaving(ctx, 'st-1')).rejects.toThrow(
      new ConflictException('Ada Okeke is still on the roll.')
    );
  });

  it('refuses with no current term with 409', async () => {
    const { service, tx } = setup(left);
    tx.term = undefined;
    await expect(service.undoLeaving(ctx, 'st-1')).rejects.toThrow(
      ConflictException
    );
  });
});

describe('LifecycleService.place', () => {
  const arm = {
    id: 'arm-2',
    levelId: 'jss2',
    display: 'JSS 2 Emerald',
    campusId: 'ikeja',
    campusName: 'Ikeja',
    retired: false,
  };
  const input = { termId: 'term-2', classArmId: 'arm-2' };

  function ready() {
    const world = setup();
    world.tx.next = { id: 'term-2', name: 'Second term' };
    world.tx.enrolment = { id: 'en-1', levelId: 'jss2', levelName: 'JSS 2' };
    world.tx.arm = arm;
    return world;
  }

  it('inserts one placement for the next term on the arm’s campus', async () => {
    const { service, tx } = ready();
    await service.place(ctx, 'st-1', input);
    expect(tx.writes).toEqual([
      [
        'insertPlacement',
        {
          organizationId: 'school-a',
          enrolmentId: 'en-1',
          termId: 'term-2',
          arm,
          actorUserId: 'caller',
        },
      ],
    ]);
    expect(tx.activities[0]?.text).toBe(
      'Ada Okeke will move to JSS 2 Emerald, Ikeja from Second term. First term records keep the old class.'
    );
  });

  it('refuses with 409 when there is no next term', async () => {
    const { service, tx } = ready();
    tx.next = undefined;
    await expect(service.place(ctx, 'st-1', input)).rejects.toThrow(
      new ConflictException('There is no next term in this school year.')
    );
  });

  it('refuses with 409 when the student already has that placement', async () => {
    const { service, tx } = ready();
    tx.placed = true;
    await expect(service.place(ctx, 'st-1', input)).rejects.toThrow(
      new ConflictException('Ada Okeke already has a Second term placement.')
    );
  });

  it('refuses with 409 for an archived student or one without an enrolment', async () => {
    const left = setup({ ...onRoll, exitKind: 'left' });
    await expect(left.service.place(ctx, 'st-1', input)).rejects.toThrow(
      ConflictException
    );
    const none = ready();
    none.tx.enrolment = undefined;
    await expect(none.service.place(ctx, 'st-1', input)).rejects.toThrow(
      ConflictException
    );
  });

  it('refuses with 400 when the term is not the next term', async () => {
    const { service } = ready();
    await expect(
      service.place(ctx, 'st-1', { ...input, termId: 'term-3' })
    ).rejects.toThrow(new BadRequestException('Choose the next term.'));
  });

  it('refuses with 400 for a class at the wrong level', async () => {
    const { service, tx } = ready();
    tx.arm = { ...arm, levelId: 'jss3' };
    await expect(service.place(ctx, 'st-1', input)).rejects.toThrow(
      new BadRequestException('Choose a JSS 2 class.')
    );
  });

  it('refuses with 400 for an archived class', async () => {
    const { service, tx } = ready();
    tx.arm = { ...arm, retired: true };
    await expect(service.place(ctx, 'st-1', input)).rejects.toThrow(
      new BadRequestException(
        'JSS 2 Emerald is archived. Choose another class.'
      )
    );
  });

  it('answers 404 for a class outside the school', async () => {
    const { service, tx } = ready();
    tx.arm = undefined;
    await expect(service.place(ctx, 'st-1', input)).rejects.toThrow(
      new NotFoundException('Class not found')
    );
    expect(tx.writes).toEqual([]);
  });
});

describe('LifecycleService.nextTermClasses', () => {
  const emerald = {
    id: 'arm-2',
    levelId: 'jss2',
    display: 'JSS 2 Emerald',
    campusId: 'ikeja',
    campusName: 'Ikeja',
    retired: false,
  };

  it('lists the open classes at the enrolment level on any campus', async () => {
    const { service, tx, students } = setup();
    tx.enrolment = { id: 'en-1', levelId: 'jss2', levelName: 'JSS 2' };
    tx.arms = [emerald];
    await expect(service.nextTermClasses(ctx, 'st-1')).resolves.toEqual([
      {
        id: 'arm-2',
        name: 'JSS 2 Emerald',
        campus: { id: 'ikeja', name: 'Ikeja' },
      },
    ]);
    expect(students.assertVisible).toHaveBeenCalledWith(ctx, 'st-1');
  });

  it('lists nothing without a current term or an enrolment', async () => {
    const { service, tx } = setup();
    tx.arms = [emerald];
    await expect(service.nextTermClasses(ctx, 'st-1')).resolves.toEqual([]);
    tx.term = undefined;
    await expect(service.nextTermClasses(ctx, 'st-1')).resolves.toEqual([]);
  });

  it('answers 404 when the caller cannot see the student', async () => {
    const { service, students } = setup();
    students.assertVisible.mockRejectedValue(new NotFoundException());
    await expect(service.nextTermClasses(ctx, 'st-1')).rejects.toThrow(
      NotFoundException
    );
  });
});
