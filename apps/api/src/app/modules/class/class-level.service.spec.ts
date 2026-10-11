import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { OrgContext } from '../../common/auth';
import type { SchoolLock } from '../../common/db/school-lock';
import { ClassLevelService } from './class-level.service';
import { FakeClassRepository } from './fake-class.repository';

const ctx = { organizationId: 'school-a' } as OrgContext;

function setup() {
  const repository = new FakeClassRepository();
  repository.levels = [
    { id: 'p1', code: 'P1', name: 'Primary 1', sequence: 1, nextLevelId: 'p2' },
    { id: 'p2', code: 'P2', name: 'Primary 2', sequence: 2, nextLevelId: 'p3' },
    { id: 'p3', code: 'P3', name: 'Primary 3', sequence: 3, nextLevelId: null },
  ];
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  const service = new ClassLevelService(
    repository,
    lock as unknown as SchoolLock
  );
  return { repository, service };
}

describe('ClassLevelService.list', () => {
  it('lists the ladder by sequence with the final year marked', async () => {
    const { repository, service } = setup();
    repository.levels.reverse();
    const levels = await service.list(ctx);
    expect(levels.map((level) => level.code)).toEqual(['P1', 'P2', 'P3']);
    expect(levels.map((level) => level.isFinalYear)).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe('ClassLevelService.create', () => {
  it('appends the level after the last one and trims the name', async () => {
    const { service } = setup();
    const created = await service.create(ctx, {
      code: 'CR',
      name: ' Creche ',
      nextLevelId: 'p1',
    });
    expect(created).toMatchObject({
      code: 'CR',
      name: 'Creche',
      sequence: 4,
      nextLevelId: 'p1',
      isFinalYear: false,
    });
  });

  it('makes a level with no next level the final year', async () => {
    const { service } = setup();
    expect(
      await service.create(ctx, { code: 'SS4', name: 'SS 4' })
    ).toMatchObject({ nextLevelId: null, isFinalYear: true });
  });

  it('answers 409 when the code is taken', async () => {
    const { service } = setup();
    await expect(
      service.create(ctx, { code: 'P1', name: 'Again' })
    ).rejects.toThrow(new ConflictException('P1 already exists.'));
  });

  it('answers 404 when the next level is not in the school', async () => {
    const { service } = setup();
    await expect(
      service.create(ctx, { code: 'CR', name: 'Creche', nextLevelId: 'other' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ClassLevelService.update', () => {
  it('renames a level and changes its next level, to none as well', async () => {
    const { service } = setup();
    expect(
      await service.update(ctx, 'p1', { name: ' Year 1 ', nextLevelId: 'p3' })
    ).toMatchObject({ name: 'Year 1', nextLevelId: 'p3', sequence: 1 });
    expect(
      await service.update(ctx, 'p1', { nextLevelId: null })
    ).toMatchObject({ nextLevelId: null, isFinalYear: true });
  });

  it('answers 400 before any lookup when a level leads to itself', () => {
    const { repository, service } = setup();
    const lookups = vi.spyOn(repository, 'findLevel');
    expect(() => service.update(ctx, 'p1', { nextLevelId: 'p1' })).toThrow(
      new BadRequestException('A level can’t lead to itself.')
    );
    expect(lookups).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown level and for a next level from another school', async () => {
    const { service } = setup();
    await expect(
      service.update(ctx, 'nope', { name: 'X' })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update(ctx, 'p1', { nextLevelId: 'other-school-level' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('moves a level to the top and renumbers the rest in one call', async () => {
    const { repository, service } = setup();
    const moved = await service.update(ctx, 'p3', { sequence: 1 });
    expect(moved.sequence).toBe(1);
    expect(repository.appliedOrders).toEqual([['p3', 'p1', 'p2']]);
    expect(
      (await service.list(ctx)).map((level) => [level.code, level.sequence])
    ).toEqual([
      ['P3', 1],
      ['P1', 2],
      ['P2', 3],
    ]);
  });

  it('clamps a position past the end and skips the write when nothing moves', async () => {
    const { repository, service } = setup();
    expect((await service.update(ctx, 'p1', { sequence: 99 })).sequence).toBe(
      3
    );
    repository.appliedOrders.length = 0;
    await service.update(ctx, 'p2', { sequence: 1 });
    expect(repository.appliedOrders).toEqual([]);
  });

  it('applies a rename and a move together', async () => {
    const { service } = setup();
    expect(
      await service.update(ctx, 'p2', { name: 'Year 2', sequence: 1 })
    ).toMatchObject({ name: 'Year 2', sequence: 1 });
  });
});
