import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import type { SchoolLock } from '../../common/db/school-lock';
import type { CampusService } from '../campus/campus.service';
import { ClassService } from './class.service';
import { FakeClassRepository } from './fake-class.repository';

const ctxFor = (
  permissions: Permission[],
  overrides: Partial<OrgContext> = {}
) =>
  ({
    organizationId: 'school-a',
    user: { id: 'caller', email: 'c@eduvault.test', name: 'Caller' },
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
    classScope: 'all',
    ...overrides,
  }) as OrgContext;

const admin = ctxFor([
  'class:create',
  'class:read',
  'class:readAll',
  'class:update',
  'class:assignTeacher',
  'student:read',
]);

function setup({ year = true } = {}) {
  const repository = new FakeClassRepository();
  repository.sessionId = year ? 'year-1' : null;
  repository.levels = [
    {
      id: 'jss1',
      code: 'JSS1',
      name: 'JSS 1',
      sequence: 1,
      nextLevelId: 'jss2',
    },
    {
      id: 'jss2',
      code: 'JSS2',
      name: 'JSS 2',
      sequence: 2,
      nextLevelId: 'ss3',
    },
    { id: 'ss3', code: 'SS3', name: 'SS 3', sequence: 3, nextLevelId: null },
  ];
  repository.campusNames = { lekki: 'Lekki', ikeja: 'Ikeja' };
  repository.custom = {
    teacher: toPermissionMap(['class:read']),
    principal: toPermissionMap(['class:read', 'campus:readAll']),
    bursar: toPermissionMap(['student:read']),
  };
  repository.members = [
    {
      userId: 'ayo',
      name: 'Ayo Bassey',
      roles: ['member', 'teacher'],
      onCampus: true,
    },
    {
      userId: 'claire',
      name: 'Claire Ade',
      roles: ['member', 'teacher'],
      onCampus: true,
    },
    {
      userId: 'emeka',
      name: 'Emeka Obi',
      roles: ['member', 'teacher'],
      onCampus: false,
    },
    {
      userId: 'grace',
      name: 'Grace Nwosu',
      roles: ['member', 'principal'],
      onCampus: false,
    },
    {
      userId: 'chika',
      name: 'Chika Eze',
      roles: ['member', 'bursar'],
      onCampus: true,
    },
    {
      userId: 'ada',
      name: 'Ada Student',
      roles: ['member', 'student'],
      onCampus: true,
    },
    {
      userId: 'funmi',
      name: 'Funmi Adeyemi',
      roles: ['owner'],
      onCampus: false,
    },
  ];
  const campuses = { assertInScope: vi.fn().mockResolvedValue(undefined) };
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  const service = new ClassService(
    repository,
    campuses as unknown as CampusService,
    lock as unknown as SchoolLock
  );
  return { repository, campuses, service };
}

const addClass = (
  repository: FakeClassRepository,
  id: string,
  overrides: Partial<(typeof repository.classes)[number]> = {}
) => {
  repository.classes.push({
    id,
    name: 'Gold',
    levelId: 'jss2',
    campusId: 'lekki',
    retiredAt: null,
    ...overrides,
  });
};

describe('ClassService.list', () => {
  it('answers 404 for a campusId outside the caller’s scope and lists nothing', async () => {
    const { repository, campuses, service } = setup();
    addClass(repository, 'gold', { campusId: 'ikeja' });
    campuses.assertInScope.mockRejectedValue(
      new NotFoundException('Campus not found')
    );
    await expect(service.list(admin, { campusId: 'ikeja' })).rejects.toThrow(
      new NotFoundException('Campus not found')
    );
    expect(campuses.assertInScope).toHaveBeenCalledWith(admin, 'ikeja');
  });

  it('shows active classes by default with ordered current-year teachers and no students', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    addClass(repository, 'ruby', {
      name: 'Ruby',
      retiredAt: '2026-07-24T00:00:00.000Z',
    });
    repository.teachers.push(
      {
        classId: 'gold',
        sessionId: 'year-1',
        userId: 'claire',
        name: 'Claire Ade',
        role: 'assistant',
      },
      {
        classId: 'gold',
        sessionId: 'year-1',
        userId: 'ayo',
        name: 'Ayo Bassey',
        role: 'lead',
      },
      {
        classId: 'gold',
        sessionId: 'old-year',
        userId: 'emeka',
        name: 'Emeka Obi',
        role: 'lead',
      }
    );
    const list = await service.list(admin, { status: 'active' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      displayName: 'JSS 2 Gold',
      studentCount: 0,
      retiredAt: null,
      classTeachers: [
        { name: 'Ayo Bassey', role: 'lead' },
        { name: 'Claire Ade', role: 'assistant' },
      ],
    });
  });

  it('offers archived and all to a caller who sees every class', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    addClass(repository, 'ruby', {
      name: 'Ruby',
      retiredAt: '2026-07-24T00:00:00.000Z',
    });
    expect(
      (await service.list(admin, { status: 'archived' })).map((c) => c.name)
    ).toEqual(['Ruby']);
    expect(
      (await service.list(admin, { status: 'all' }))
        .map((c) => c.name)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['Gold', 'Ruby']);
  });

  it('filters by campus and level and keeps to the campus scope', async () => {
    const { repository, service } = setup();
    addClass(repository, 'a', { name: 'A', campusId: 'lekki' });
    addClass(repository, 'b', { name: 'B', campusId: 'ikeja' });
    addClass(repository, 'c', { name: 'C', levelId: 'ss3' });
    expect(
      (await service.list(admin, { status: 'active', campusId: 'ikeja' })).map(
        (x) => x.id
      )
    ).toEqual(['b']);
    expect(
      (await service.list(admin, { status: 'active', levelId: 'ss3' })).map(
        (x) => x.id
      )
    ).toEqual(['c']);
    const lekkiOnly = ctxFor(['class:read', 'class:readAll'], {
      campusScope: ['lekki'],
    });
    expect(
      (await service.list(lekkiOnly, { status: 'active' }))
        .map((x) => x.id)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['a', 'c']);
  });

  it('forces active and the caller’s classes for a class-scoped caller', async () => {
    const { repository, service } = setup();
    addClass(repository, 'mine');
    addClass(repository, 'mine-archived', {
      name: 'Old',
      retiredAt: '2026-07-24T00:00:00.000Z',
    });
    addClass(repository, 'theirs', { name: 'Silver' });
    const teacher = ctxFor(['class:read'], {
      classScope: ['mine', 'mine-archived'],
    });
    expect(
      (await service.list(teacher, { status: 'all' })).map((c) => c.id)
    ).toEqual(['mine']);
    expect(
      await service.list(ctxFor(['class:read'], { classScope: [] }), {
        status: 'active',
      })
    ).toEqual([]);
  });

  it('lists no class teachers when no term is current', async () => {
    const { repository, service } = setup({ year: false });
    addClass(repository, 'gold');
    repository.teachers.push({
      classId: 'gold',
      sessionId: 'year-1',
      userId: 'ayo',
      name: 'Ayo Bassey',
      role: 'lead',
    });
    const [only] = await service.list(admin, { status: 'active' });
    expect(only?.classTeachers).toEqual([]);
  });
});

describe('ClassService.get', () => {
  it('shows the class with its final-year flag and an empty roster for a student reader', async () => {
    const { repository, service } = setup();
    addClass(repository, 'last', { levelId: 'ss3' });
    expect(await service.get(admin, 'last')).toMatchObject({
      displayName: 'SS 3 Gold',
      isFinalYear: true,
      roster: [],
    });
  });

  it('leaves the roster out without student:read', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    const noStudents = ctxFor(['class:read', 'class:readAll']);
    expect((await service.get(noStudents, 'gold')).roster).toBeNull();
  });

  it('answers 404 for an unknown class, another campus and a class outside the scope', async () => {
    const { repository, service } = setup();
    addClass(repository, 'ikeja-class', { campusId: 'ikeja' });
    addClass(repository, 'other');
    const notFound = new NotFoundException('Class not found');
    await expect(service.get(admin, 'nope')).rejects.toThrow(notFound);
    await expect(
      service.get(
        ctxFor(['class:read', 'class:readAll'], { campusScope: ['lekki'] }),
        'ikeja-class'
      )
    ).rejects.toThrow(notFound);
    await expect(
      service.get(
        ctxFor(['class:read'], { classScope: ['ikeja-class'] }),
        'other'
      )
    ).rejects.toThrow(notFound);
  });
});

describe('ClassService.create', () => {
  const input = { levelId: 'jss1', campusId: 'lekki', name: ' Diamond ' };

  it('creates the class and answers its summary', async () => {
    const { service, campuses } = setup();
    const created = await service.create(admin, input);
    expect(created).toMatchObject({
      name: 'Diamond',
      displayName: 'JSS 1 Diamond',
      campus: { id: 'lekki', name: 'Lekki' },
      classTeachers: [],
      studentCount: 0,
      retiredAt: null,
    });
    expect(campuses.assertInScope).toHaveBeenCalledWith(admin, 'lekki');
  });

  it('shows a class-scoped creator the class they just made', async () => {
    const { service } = setup();
    const scoped = ctxFor(['class:create', 'class:read'], { classScope: [] });
    expect(await service.create(scoped, input)).toMatchObject({
      displayName: 'JSS 1 Diamond',
    });
  });

  it('answers 404 for a level that is not in the school', async () => {
    const { service } = setup();
    await expect(
      service.create(admin, { ...input, levelId: 'elsewhere' })
    ).rejects.toThrow(new NotFoundException('Level not found'));
  });

  it('answers 404 when the campus is out of scope', async () => {
    const { service, campuses } = setup();
    campuses.assertInScope.mockRejectedValue(
      new NotFoundException('Campus not found')
    );
    await expect(service.create(admin, input)).rejects.toThrow(
      new NotFoundException('Campus not found')
    );
  });

  it('answers 409 for an active class of that name on the campus', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold', { levelId: 'jss1', name: 'Diamond' });
    await expect(service.create(admin, input)).rejects.toThrow(
      new ConflictException('JSS 1 Diamond already exists on Lekki.')
    );
  });

  it('answers 409 with the restore copy for an archived match', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold', {
      levelId: 'jss1',
      name: 'Diamond',
      retiredAt: '2026-07-24T00:00:00.000Z',
    });
    await expect(service.create(admin, input)).rejects.toThrow(
      new ConflictException(
        'JSS 1 Diamond already exists on Lekki and is archived. Restore it instead.'
      )
    );
  });

  it('hides which class holds the name from a class-scoped creator who cannot see it', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold', { levelId: 'jss1', name: 'Diamond' });
    const scoped = ctxFor(['class:create', 'class:read'], { classScope: [] });
    await expect(service.create(scoped, input)).rejects.toThrow(
      new ConflictException('That class name is already taken.')
    );
  });

  it('names the clashing class to a class-scoped creator who teaches it', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold', { levelId: 'jss1', name: 'Diamond' });
    const scoped = ctxFor(['class:create', 'class:read'], {
      classScope: ['gold'],
    });
    await expect(service.create(scoped, input)).rejects.toThrow(
      new ConflictException('JSS 1 Diamond already exists on Lekki.')
    );
  });

  it('allows the same name on another campus or level', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold', {
      levelId: 'jss1',
      name: 'Diamond',
      campusId: 'ikeja',
    });
    addClass(repository, 'silver', { levelId: 'jss2', name: 'Diamond' });
    expect(await service.create(admin, input)).toMatchObject({
      name: 'Diamond',
    });
  });
});

describe('ClassService.update', () => {
  it('renames a class', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    expect(
      await service.update(admin, 'gold', { name: ' Emerald ' })
    ).toMatchObject({
      name: 'Emerald',
      displayName: 'JSS 2 Emerald',
    });
    expect(repository.classes[0]?.name).toBe('Emerald');
  });

  it('answers 409 when the new name is taken, with the archived copy when it is', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    addClass(repository, 'silver', { name: 'Silver' });
    addClass(repository, 'ruby', {
      name: 'Ruby',
      retiredAt: '2026-07-24T00:00:00.000Z',
    });
    await expect(
      service.update(admin, 'gold', { name: 'Silver' })
    ).rejects.toThrow(
      new ConflictException('JSS 2 Silver already exists on Lekki.')
    );
    await expect(
      service.update(admin, 'gold', { name: 'Ruby' })
    ).rejects.toThrow(
      new ConflictException(
        'JSS 2 Ruby already exists on Lekki and is archived. Restore it instead.'
      )
    );
  });

  it('keeps a class’s own name without a conflict', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    expect(await service.update(admin, 'gold', { name: 'Gold' })).toMatchObject(
      {
        name: 'Gold',
      }
    );
  });

  it('archives with the caller and restores', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    const archived = await service.update(admin, 'gold', { archived: true });
    expect(archived.retiredAt).not.toBeNull();
    const restored = await service.update(admin, 'gold', { archived: false });
    expect(restored.retiredAt).toBeNull();
  });

  it('refuses to archive while students are placed, and still restores', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    repository.placements = true;
    await expect(
      service.update(admin, 'gold', { archived: true })
    ).rejects.toThrow(
      new ConflictException(
        'Students are placed in JSS 2 Gold this term or later, so it can’t be archived yet.'
      )
    );
    expect(repository.classes[0]?.retiredAt).toBeNull();
    addClass(repository, 'ruby', {
      name: 'Ruby',
      retiredAt: '2026-07-24T00:00:00.000Z',
    });
    expect(
      (await service.update(admin, 'ruby', { archived: false })).retiredAt
    ).toBeNull();
  });

  it('keeps the old name when a rename and an archive arrive together and the archive is refused', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    repository.placements = true;
    await expect(
      service.update(admin, 'gold', { name: 'Platinum', archived: true })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.classes[0]?.name).toBe('Gold');
  });

  it('does not check placements for a class that is already archived', async () => {
    const { repository, service } = setup();
    addClass(repository, 'ruby', {
      name: 'Ruby',
      retiredAt: '2026-07-24T00:00:00.000Z',
    });
    repository.placements = true;
    expect(
      (await service.update(admin, 'ruby', { archived: true })).retiredAt
    ).toBe('2026-07-24T00:00:00.000Z');
  });

  it('answers 404 for a class out of scope', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold', { campusId: 'ikeja' });
    await expect(
      service.update(
        ctxFor(['class:update'], { campusScope: ['lekki'] }),
        'gold',
        {
          archived: true,
        }
      )
    ).rejects.toThrow(new NotFoundException('Class not found'));
  });
});

describe('ClassService.teacherCandidates', () => {
  it('lists class:read holders on the campus and campus:readAll holders, by name, minus current teachers', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    repository.teachers.push({
      classId: 'gold',
      sessionId: 'year-1',
      userId: 'ayo',
      name: 'Ayo Bassey',
      role: 'lead',
    });
    const candidates = await service.teacherCandidates(admin, 'gold');
    expect(candidates.map((candidate) => candidate.name)).toEqual([
      'Claire Ade',
      'Funmi Adeyemi',
      'Grace Nwosu',
    ]);
  });

  it('leaves out other-campus teachers without campus:readAll, people without class:read and portal-only accounts', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    const names = (await service.teacherCandidates(admin, 'gold')).map(
      (candidate) => candidate.userId
    );
    expect(names).not.toContain('emeka');
    expect(names).not.toContain('chika');
    expect(names).not.toContain('ada');
  });

  it('still lists a teacher who taught last year, and answers 404 out of scope', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    repository.teachers.push({
      classId: 'gold',
      sessionId: 'old-year',
      userId: 'ayo',
      name: 'Ayo Bassey',
      role: 'lead',
    });
    expect(
      (await service.teacherCandidates(admin, 'gold')).map((c) => c.userId)
    ).toContain('ayo');
    await expect(
      service.teacherCandidates(
        ctxFor(['class:assignTeacher'], { classScope: [] }),
        'gold'
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ClassService.assignTeacher', () => {
  it('adds the teacher with the caller as the creator', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    expect(
      await service.assignTeacher(admin, 'gold', {
        userId: 'ayo',
        role: 'lead',
      })
    ).toEqual({ userId: 'ayo', name: 'Ayo Bassey', role: 'lead' });
    expect(repository.teachers).toHaveLength(1);
    expect(repository.teachers[0]).toMatchObject({ sessionId: 'year-1' });
  });

  it('answers 404 for a class out of scope and for a user who is not a member', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    await expect(
      service.assignTeacher(admin, 'nope', { userId: 'ayo', role: 'lead' })
    ).rejects.toThrow(new NotFoundException('Class not found'));
    await expect(
      service.assignTeacher(admin, 'gold', { userId: 'stranger', role: 'lead' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 409 when no term is current', async () => {
    const { repository, service } = setup({ year: false });
    addClass(repository, 'gold');
    await expect(
      service.assignTeacher(admin, 'gold', { userId: 'ayo', role: 'lead' })
    ).rejects.toThrow(
      new ConflictException('Make a term current before adding class teachers.')
    );
  });

  it('answers 409 for an archived class', async () => {
    const { repository, service } = setup();
    addClass(repository, 'ruby', {
      name: 'Ruby',
      retiredAt: '2026-07-24T00:00:00.000Z',
    });
    await expect(
      service.assignTeacher(admin, 'ruby', { userId: 'ayo', role: 'lead' })
    ).rejects.toThrow(
      new ConflictException(
        'JSS 2 Ruby is archived. Restore it before adding teachers.'
      )
    );
  });

  it('answers 400 for someone who is not a candidate', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    await expect(
      service.assignTeacher(admin, 'gold', {
        userId: 'emeka',
        role: 'assistant',
      })
    ).rejects.toThrow(
      new BadRequestException(
        'Only teachers on the Lekki campus can be class teachers of this class.'
      )
    );
    await expect(
      service.assignTeacher(admin, 'gold', {
        userId: 'chika',
        role: 'assistant',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 409 when they already teach the class this year', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    await service.assignTeacher(admin, 'gold', { userId: 'ayo', role: 'lead' });
    await expect(
      service.assignTeacher(admin, 'gold', { userId: 'ayo', role: 'assistant' })
    ).rejects.toThrow(
      new ConflictException(
        'Ayo Bassey is already a class teacher of JSS 2 Gold.'
      )
    );
  });

  it('answers 409 naming the lead for a second lead, but takes assistants and uniform teachers', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    await service.assignTeacher(admin, 'gold', { userId: 'ayo', role: 'lead' });
    await expect(
      service.assignTeacher(admin, 'gold', { userId: 'claire', role: 'lead' })
    ).rejects.toThrow(
      new ConflictException(
        'JSS 2 Gold already has a lead class teacher: Ayo Bassey.'
      )
    );
    expect(
      await service.assignTeacher(admin, 'gold', {
        userId: 'claire',
        role: 'assistant',
      })
    ).toMatchObject({ role: 'assistant' });
    expect(
      await service.assignTeacher(admin, 'gold', {
        userId: 'grace',
        role: 'uniform',
      })
    ).toMatchObject({ role: 'uniform' });
  });
});

describe('ClassService.removeTeacher', () => {
  it('removes this year’s assignment', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    await service.assignTeacher(admin, 'gold', { userId: 'ayo', role: 'lead' });
    expect(await service.removeTeacher(admin, 'gold', 'ayo')).toEqual({
      classId: 'gold',
      userId: 'ayo',
    });
    expect(repository.teachers).toEqual([]);
  });

  it('answers 404 when there is no assignment this year, and for a class out of scope', async () => {
    const { repository, service } = setup();
    addClass(repository, 'gold');
    repository.teachers.push({
      classId: 'gold',
      sessionId: 'old-year',
      userId: 'ayo',
      name: 'Ayo Bassey',
      role: 'lead',
    });
    await expect(
      service.removeTeacher(admin, 'gold', 'ayo')
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeTeacher(admin, 'nope', 'ayo')).rejects.toThrow(
      new NotFoundException('Class not found')
    );
  });

  it('answers 404 when no term is current', async () => {
    const { repository, service } = setup({ year: false });
    addClass(repository, 'gold');
    await expect(
      service.removeTeacher(admin, 'gold', 'ayo')
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
