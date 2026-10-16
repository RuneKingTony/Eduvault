import { ConflictException, NotFoundException } from '@nestjs/common';
import { createSubjectSchema } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import type { SchoolLock } from '../../common/db/school-lock';
import { FakeSubjectRepository } from './fake-subject.repository';
import { SubjectService } from './subject.service';

const ctx = {
  organizationId: 'school-a',
  user: { id: 'caller', email: 'c@eduvault.test', name: 'Caller' },
  permissions: toPermissionMap(['subject:read']),
  campusScope: 'all',
  classScope: 'all',
} as OrgContext;

function setup() {
  const repository = new FakeSubjectRepository();
  repository.levelCodes = { jss1: 'JSS1', jss2: 'JSS2' };
  repository.levelSequence = { jss1: 1, jss2: 2 };
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  const service = new SubjectService(repository, lock as unknown as SchoolLock);
  return { repository, service };
}

const newSubject = (code: string, name: string) =>
  createSubjectSchema.parse({ code, name });

const list = (service: SubjectService, page = 1) =>
  service.list(ctx, { page, includeRetired: true });

describe('SubjectService code normalisation', () => {
  it('stores the code upper-case and the name trimmed', async () => {
    const { service } = setup();
    const created = await service.create(
      ctx,
      newSubject(' geo ', ' Geography ')
    );
    expect(created).toMatchObject({
      code: 'GEO',
      name: 'Geography',
      levelCodes: [],
    });
  });

  it('answers 409 for a duplicate code, also against a retired subject', async () => {
    const { service } = setup();
    const agr = await service.create(ctx, newSubject('AGR', 'Agriculture'));
    await service.update(ctx, agr.id, { retired: true });
    await expect(
      service.create(ctx, newSubject('agr', 'Anything'))
    ).rejects.toThrow(
      new ConflictException(
        'A subject with code AGR already exists. Codes are unique per school.'
      )
    );
  });
});

describe('SubjectService ordering', () => {
  it('lists active subjects by name, then retired ones, 10 to a page', async () => {
    const { service } = setup();
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
    for (const [index, letter] of letters.entries()) {
      await service.create(
        ctx,
        newSubject(letter, `Subject ${letters[10 - index] ?? ''}`)
      );
    }
    const old = await service.create(
      ctx,
      newSubject('AAA', 'Aardvark studies')
    );
    await service.update(ctx, old.id, { retired: true });
    const first = await list(service);
    expect(first.total).toBe(12);
    expect(first.items).toHaveLength(10);
    expect(first.items.map((item) => item.name)).toEqual(
      first.items
        .map((item) => item.name)
        .toSorted((a, b) => a.localeCompare(b))
    );
    expect(first.items.every((item) => item.retiredAt === null)).toBe(true);
    const second = await list(service, 2);
    expect(second.items.map((item) => item.code)).toEqual(['A', 'AAA']);
    expect(second.items[1]?.retiredAt).not.toBeNull();
  });

  it('leaves retired subjects out when asked', async () => {
    const { service } = setup();
    const one = await service.create(ctx, newSubject('ONE', 'One'));
    await service.create(ctx, newSubject('TWO', 'Two'));
    await service.update(ctx, one.id, { retired: true });
    const page = await service.list(ctx, { page: 1, includeRetired: false });
    expect(page.items.map((item) => item.code)).toEqual(['TWO']);
    expect(page.total).toBe(1);
  });

  it('lists the level codes in level order', async () => {
    const { repository, service } = setup();
    const maths = await service.create(ctx, newSubject('MTH', 'Mathematics'));
    repository.levelSubjects = [
      { classLevelId: 'jss2', subjectId: maths.id, kind: 'core', sequence: 1 },
      { classLevelId: 'jss1', subjectId: maths.id, kind: 'core', sequence: 1 },
    ];
    expect((await list(service)).items[0]?.levelCodes).toEqual([
      'JSS1',
      'JSS2',
    ]);
  });
});

describe('SubjectService retire guard', () => {
  it('refuses to retire a subject still on a level list', async () => {
    const { repository, service } = setup();
    const french = await service.create(ctx, newSubject('FRE', 'French'));
    repository.levelSubjects = [
      {
        classLevelId: 'jss1',
        subjectId: french.id,
        kind: 'elective',
        sequence: 6,
      },
    ];
    await expect(
      service.update(ctx, french.id, { retired: true })
    ).rejects.toThrow(
      new ConflictException('Take French off every class level first.')
    );
    expect(repository.subjects[0]?.retiredAt).toBeNull();
  });

  it('retires, restores and renames while keeping the code', async () => {
    const { service } = setup();
    const eng = await service.create(ctx, newSubject('ENG', 'English'));
    const retired = await service.update(ctx, eng.id, { retired: true });
    expect(retired.retiredAt).not.toBeNull();
    const restored = await service.update(ctx, eng.id, {
      retired: false,
      name: 'English Studies',
    });
    expect(restored).toMatchObject({
      code: 'ENG',
      name: 'English Studies',
      retiredAt: null,
    });
  });

  it('answers 404 for an unknown subject', async () => {
    const { service } = setup();
    await expect(service.update(ctx, 'missing', { name: 'X' })).rejects.toThrow(
      NotFoundException
    );
  });
});

describe('SubjectService level subjects', () => {
  it('answers 404 for a level that is not in the school', async () => {
    const { service } = setup();
    await expect(
      service.levelSubjects(ctx, { classLevelId: 'other-school-level' })
    ).rejects.toThrow(NotFoundException);
  });

  it('lists the level list in sequence with the subject names', async () => {
    const { repository, service } = setup();
    const maths = await service.create(ctx, newSubject('MTH', 'Mathematics'));
    const french = await service.create(ctx, newSubject('FRE', 'French'));
    repository.levelSubjects = [
      {
        classLevelId: 'jss1',
        subjectId: french.id,
        kind: 'elective',
        sequence: 2,
      },
      { classLevelId: 'jss1', subjectId: maths.id, kind: 'core', sequence: 1 },
    ];
    const rows = await service.levelSubjects(ctx, { classLevelId: 'jss1' });
    expect(
      rows.map((row) => [row.subjectName, row.kind, row.sequence])
    ).toEqual([
      ['Mathematics', 'core', 1],
      ['French', 'elective', 2],
    ]);
  });
});
