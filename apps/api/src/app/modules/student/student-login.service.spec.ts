import { ConflictException, NotFoundException } from '@nestjs/common';
import { toPermissionMap } from '@eduvault/policy';
import type { AccountService, OrgContext } from '../../common/auth';
import type { SchoolLock } from '../../common/db/school-lock';
import { FakeLifecycleRepository } from './fake-lifecycle.repository';
import type { LifecycleStudent } from './lifecycle.repository';
import { LifecycleRunner } from './lifecycle-runner';
import { StudentLoginService } from './student-login.service';
import type { StudentService } from './student.service';

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

function setup(student: LifecycleStudent | undefined = onRoll) {
  const repository = new FakeLifecycleRepository();
  repository.tx.student = student;
  const students = {
    assertVisible: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({
      id: 'st-1',
      portalLogin: { username: 'greenfield-0234', active: true },
    }),
  };
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  const runner = new LifecycleRunner(
    repository,
    students as unknown as StudentService,
    lock as unknown as SchoolLock
  );
  const accounts = {
    hashPassword: (password: string) => Promise.resolve(`hash:${password}`),
  } as unknown as AccountService;
  return {
    tx: repository.tx,
    students,
    service: new StudentLoginService(runner, accounts),
  };
}

describe('StudentLoginService.resetLogin', () => {
  it('writes a new hash, records the reset without the password and returns the login name once', async () => {
    const { service, tx } = setup();

    const result = await service.resetLogin(ctx, 'st-1');

    expect(result.username).toBe('greenfield-0234');
    expect(result.temporaryPassword).not.toBe('');
    expect(tx.writes).toEqual([
      [
        'resetLogin',
        {
          organizationId: 'school-a',
          userId: 'user-ada',
          passwordHash: `hash:${result.temporaryPassword}`,
        },
      ],
    ]);
    expect(tx.activities).toHaveLength(1);
    expect(tx.activities[0]).toMatchObject({
      pillar: 'access',
      kind: 'student.login_reset',
      subjectId: 'st-1',
      text: 'Tunde Bakare reset Ada Okeke’s login.',
    });
    expect(JSON.stringify(tx.activities)).not.toContain(
      result.temporaryPassword
    );
  });

  it('answers 404 before anything when the caller cannot see the student', async () => {
    const { service, students, tx } = setup();
    students.assertVisible.mockRejectedValue(new NotFoundException());

    await expect(service.resetLogin(ctx, 'st-1')).rejects.toThrow(
      NotFoundException
    );
    expect(tx.writes).toEqual([]);
  });

  it('answers 409 for a student who has left, because the login is closed', async () => {
    const { service, tx } = setup({ ...onRoll, exitKind: 'left' });

    await expect(service.resetLogin(ctx, 'st-1')).rejects.toThrow(
      'Ada Okeke is no longer on the roll.'
    );
    expect(tx.writes).toEqual([]);
  });

  it('answers 409 for a student with no login', async () => {
    const { service } = setup({ ...onRoll, userId: null });

    await expect(service.resetLogin(ctx, 'st-1')).rejects.toThrow(
      'This student has no portal login to reset.'
    );
  });

  it('answers 409 and records nothing when the login is shared', async () => {
    const { service, tx } = setup();
    tx.loginOutcome = 'shared';

    await expect(service.resetLogin(ctx, 'st-1')).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(tx.activities).toEqual([]);
  });
});
