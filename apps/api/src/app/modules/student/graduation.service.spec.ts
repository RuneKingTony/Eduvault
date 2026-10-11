import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { ClassDetail } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { SchoolLock } from '../../common/db/school-lock';
import type { ClassService } from '../class/class.service';
import { FakeLifecycleRepository } from './fake-lifecycle.repository';
import { GraduationService } from './graduation.service';

const ctx = {
  organizationId: 'school-a',
  user: { id: 'caller', email: 'c@eduvault.test', name: 'Tunde Bakare' },
} as OrgContext;

const roster = ['a', 'b', 'c'].map((id) => ({
  id,
  userId: `user-${id}`,
  name: `Student ${id}`,
  campusId: 'lekki',
}));

function setup(klass: Partial<ClassDetail> = {}) {
  const repository = new FakeLifecycleRepository();
  repository.tx.roster = roster;
  repository.tx.term = {
    termId: 'term-3',
    termName: 'Third term',
    sessionId: 'year-1',
    sessionName: '2026/2027',
  };
  const classes = {
    get: vi.fn().mockResolvedValue({
      id: 'arm-1',
      displayName: 'SS 3 Gold',
      isFinalYear: true,
      ...klass,
    }),
  };
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  return {
    tx: repository.tx,
    classes,
    service: new GraduationService(
      classes as unknown as ClassService,
      repository,
      lock as unknown as SchoolLock
    ),
  };
}

describe('GraduationService', () => {
  it('graduates the ticked students in the current session and term', async () => {
    const { service, tx } = setup();
    await expect(
      service.graduate(ctx, 'arm-1', { studentIds: ['a', 'b'] })
    ).resolves.toEqual({ graduated: 2 });
    expect(tx.writes).toEqual([
      [
        'graduate',
        {
          organizationId: 'school-a',
          actorUserId: 'caller',
          termId: 'term-3',
          sessionId: 'year-1',
          students: roster.slice(0, 2),
        },
      ],
    ]);
  });

  it('counts a student ticked twice once', async () => {
    const { service } = setup();
    await expect(
      service.graduate(ctx, 'arm-1', { studentIds: ['a', 'a'] })
    ).resolves.toEqual({ graduated: 1 });
  });

  it('answers 404 when the class is outside the caller’s scope or school', async () => {
    const { service, classes, tx } = setup();
    classes.get.mockRejectedValue(new NotFoundException('Class not found'));
    await expect(
      service.graduate(ctx, 'arm-1', { studentIds: ['a'] })
    ).rejects.toThrow(NotFoundException);
    expect(tx.writes).toEqual([]);
  });

  it('refuses a class that is not final year with 400', async () => {
    const { service, tx } = setup({
      isFinalYear: false,
      displayName: 'JSS 2 Gold',
    });
    await expect(
      service.graduate(ctx, 'arm-1', { studentIds: ['a'] })
    ).rejects.toThrow(
      new BadRequestException('JSS 2 Gold is not a final-year class.')
    );
    expect(tx.writes).toEqual([]);
  });

  it('writes nothing when one id is not on the roster', async () => {
    const { service, tx } = setup();
    await expect(
      service.graduate(ctx, 'arm-1', { studentIds: ['a', 'stranger'] })
    ).rejects.toThrow(
      new BadRequestException(
        'Every ticked student must be on this class’s roster this term.'
      )
    );
    expect(tx.writes).toEqual([]);
  });

  it('refuses with 409 when no term is current', async () => {
    const { service, tx } = setup();
    tx.term = undefined;
    await expect(
      service.graduate(ctx, 'arm-1', { studentIds: ['a'] })
    ).rejects.toThrow(ConflictException);
    expect(tx.writes).toEqual([]);
  });
});
