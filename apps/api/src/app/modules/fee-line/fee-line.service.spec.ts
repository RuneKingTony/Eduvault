import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  FEE_COPY_NO_SOURCE_MESSAGE,
  FEE_EVERY_CAMPUS_MESSAGE,
  FEE_LINE_ALREADY_RETIRED_MESSAGE,
  FEE_LINE_RETIRED_MESSAGE,
  FEE_TERM_ENDED_MESSAGE,
  FEE_TYPE_INVALID_MESSAGE,
  type CreateFeeLineInput,
  type FeeLine,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { Clock } from '../../common/clock';
import type { CampusService } from '../campus/campus.service';
import { FakeFeeLineRepository } from './fake-fee-line.repository';
import { FeeLineService } from './fee-line.service';

const ctxFor = (campusScope: OrgContext['campusScope']) =>
  ({
    organizationId: 'school-a',
    user: { id: 'caller', email: 'c@eduvault.test', name: 'Chika Eze' },
    campusScope,
  }) as OrgContext;

const everyone = ctxFor('all');
const lekkiOnly = ctxFor(['lekki']);

const line = (over: Partial<FeeLine> = {}): FeeLine => ({
  id: 'line-1',
  termId: 'term-1',
  classLevelId: 'jss2',
  levelName: 'JSS 2',
  levelSequence: 8,
  feeTypeId: 'tuition',
  feeTypeCode: 4010,
  feeTypeName: 'Tuition',
  campusId: null,
  campusName: null,
  name: 'Tuition',
  amountMinor: 18_000_000,
  appliesTo: 'all',
  isOptional: false,
  retiredAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const input = (over: Partial<CreateFeeLineInput> = {}): CreateFeeLineInput => ({
  termId: 'term-1',
  classLevelId: 'jss2',
  feeTypeId: 'tuition',
  campusId: null,
  name: 'Tuition',
  amountMinor: 18_000_000,
  appliesTo: 'all',
  isOptional: false,
  ...over,
});

function setup(...seeded: FeeLine[]) {
  const lines = new FakeFeeLineRepository();
  lines.rows.push(...seeded);
  lines.terms.set('term-1', {
    id: 'term-1',
    name: 'First term',
    schoolYearName: '2026/2027',
    sessionId: 'session-1',
    startsOn: '2026-09-07',
    endsOn: '2026-12-18',
  });
  lines.terms.set('past', {
    id: 'past',
    name: 'Third term',
    schoolYearName: '2025/2026',
    sessionId: 'session-0',
    startsOn: '2026-04-20',
    endsOn: '2026-07-24',
  });
  lines.levels.set('jss2', { id: 'jss2', name: 'JSS 2' });
  lines.campusNames.set('lekki', 'Lekki');
  lines.feeTypes.set('tuition', { id: 'tuition', code: 4010, name: 'Tuition' });
  lines.feeTypes.set('pta', { id: 'pta', code: 4020, name: 'PTA fee' });
  lines.otherAccounts.add('rent');
  const campuses = {
    get: vi
      .fn()
      .mockImplementation((ctx: OrgContext, id: string) =>
        ctx.campusScope === 'all' || ctx.campusScope.includes(id)
          ? Promise.resolve({ id, name: id === 'lekki' ? 'Lekki' : 'Ikeja' })
          : Promise.reject(new NotFoundException('Campus not found'))
      ),
  };
  const clock = { today: () => '2026-10-15' } as Clock;
  return {
    lines,
    campuses,
    service: new FeeLineService(
      lines,
      campuses as unknown as CampusService,
      clock
    ),
  };
}

describe('FeeLineService.create', () => {
  it('saves an every-campus line for a member who sees every campus', async () => {
    const { service, lines } = setup();
    const saved = await service.create(everyone, input());
    expect(saved.amountMinor).toBe(18_000_000);
    expect(lines.created[0]).toMatchObject({
      organizationId: 'school-a',
      userId: 'caller',
      campusId: null,
    });
  });

  it('refuses an every-campus line to a campus-scoped member with 403', async () => {
    const { service, lines } = setup();
    const refused = service.create(lekkiOnly, input());
    await expect(refused).rejects.toBeInstanceOf(ForbiddenException);
    await expect(refused).rejects.toThrow(FEE_EVERY_CAMPUS_MESSAGE);
    expect(lines.created).toEqual([]);
  });

  it('lets a campus-scoped member add a line on their own campus', async () => {
    const { service } = setup();
    const saved = await service.create(lekkiOnly, input({ campusId: 'lekki' }));
    expect(saved.campusId).toBe('lekki');
  });

  it('answers 404 for a campus outside the scope', async () => {
    const { service, lines } = setup();
    await expect(
      service.create(lekkiOnly, input({ campusId: 'ikeja' }))
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(lines.created).toEqual([]);
  });

  it('answers 404 for a term or level that is not in the school', async () => {
    const { service } = setup();
    await expect(
      service.create(everyone, input({ termId: 'elsewhere' }))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.create(everyone, input({ classLevelId: 'elsewhere' }))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 400 for a fee type that is not under Fee income', async () => {
    const { service } = setup();
    const refused = service.create(everyone, input({ feeTypeId: 'rent' }));
    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow(FEE_TYPE_INVALID_MESSAGE);
  });

  it('answers 404 for a fee type that is not in the school', async () => {
    const { service, lines } = setup();
    await expect(
      service.create(everyone, input({ feeTypeId: 'elsewhere' }))
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(lines.created).toEqual([]);
  });

  it('answers 400 for a term that has ended', async () => {
    const { service, lines } = setup();
    const refused = service.create(everyone, input({ termId: 'past' }));
    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow(FEE_TERM_ENDED_MESSAGE);
    expect(lines.created).toEqual([]);
  });

  it('answers 409 naming the fee type, level and campus for a duplicate', async () => {
    const { service, lines } = setup();
    lines.duplicate = true;
    const refused = service.create(everyone, input({ campusId: 'ikeja' }));
    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toThrow(
      'There is already a Tuition fee for JSS 2 on Ikeja this term. Change its amount instead.'
    );
  });

  it('names every campus in the duplicate message of an every-campus line', async () => {
    const { service, lines } = setup();
    lines.duplicate = true;
    await expect(service.create(everyone, input())).rejects.toThrow(
      'on every campus this term'
    );
  });
});

describe('FeeLineService.updateAmount', () => {
  it('changes the amount of a live line', async () => {
    const { service } = setup(line());
    const updated = await service.updateAmount(everyone, 'line-1', {
      amountMinor: 20_000_000,
    });
    expect(updated.amountMinor).toBe(20_000_000);
  });

  it('answers 404 for a campus line outside the scope', async () => {
    const { service } = setup(line({ campusId: 'ikeja' }));
    await expect(
      service.updateAmount(lekkiOnly, 'line-1', { amountMinor: 1 })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 403 for an every-campus line from a campus-scoped member', async () => {
    const { service } = setup(line());
    await expect(
      service.updateAmount(lekkiOnly, 'line-1', { amountMinor: 1 })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 409 for a retired line', async () => {
    const { service } = setup(line({ retiredAt: '2026-10-02T00:00:00.000Z' }));
    const refused = service.updateAmount(everyone, 'line-1', {
      amountMinor: 1,
    });
    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toThrow(FEE_LINE_RETIRED_MESSAGE);
  });

  it('answers 400 when the term has ended', async () => {
    const { service } = setup(line({ termId: 'past' }));
    await expect(
      service.updateAmount(everyone, 'line-1', { amountMinor: 1 })
    ).rejects.toThrow(FEE_TERM_ENDED_MESSAGE);
  });
});

describe('FeeLineService.retire', () => {
  it('answers 409 the second time', async () => {
    const { service } = setup(line());
    await service.retire(everyone, 'line-1');
    const again = service.retire(everyone, 'line-1');
    await expect(again).rejects.toBeInstanceOf(ConflictException);
    await expect(again).rejects.toThrow(FEE_LINE_ALREADY_RETIRED_MESSAGE);
  });

  it('answers 403 for an every-campus line from a campus-scoped member and 404 for another campus', async () => {
    const { service } = setup(
      line(),
      line({ id: 'line-2', campusId: 'ikeja' })
    );
    await expect(service.retire(lekkiOnly, 'line-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(service.retire(lekkiOnly, 'line-2')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('answers 400 when the term has ended', async () => {
    const { service } = setup(line({ termId: 'past' }));
    await expect(service.retire(everyone, 'line-1')).rejects.toThrow(
      FEE_TERM_ENDED_MESSAGE
    );
  });
});

describe('FeeLineService.list', () => {
  it('answers 404 for a term outside the school', async () => {
    const { service } = setup();
    await expect(
      service.list(everyone, {
        termId: 'elsewhere',
        includeRetired: true,
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters by group and fee type, keeping retired lines when asked', async () => {
    const { service } = setup(
      line(),
      line({
        id: 'line-2',
        feeTypeId: 'pta',
        feeTypeCode: 4020,
        feeTypeName: 'PTA fee',
        retiredAt: '2026-10-02T00:00:00.000Z',
      })
    );
    const school = await service.list(everyone, {
      termId: 'term-1',
      group: 'school',
      includeRetired: true,
    });
    expect(school.map((row) => row.id)).toEqual(['line-1']);
    const other = await service.list(everyone, {
      termId: 'term-1',
      group: 'other',
      includeRetired: true,
    });
    expect(other.map((row) => row.id)).toEqual(['line-2']);
    const live = await service.list(everyone, {
      termId: 'term-1',
      group: 'other',
      includeRetired: false,
    });
    expect(live).toEqual([]);
    const byType = await service.list(everyone, {
      termId: 'term-1',
      feeTypeId: 'pta',
      includeRetired: true,
    });
    expect(byType.map((row) => row.id)).toEqual(['line-2']);
  });
});

describe('FeeLineService.copySource', () => {
  it('answers 404 for a term outside the school', async () => {
    const { service } = setup();
    await expect(
      service.copySource(everyone, 'elsewhere')
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('names no source for the earliest term', async () => {
    const { service } = setup();
    await expect(service.copySource(everyone, 'past')).resolves.toEqual({
      sourceTerm: null,
      liveLineCount: 0,
      targetHasLines: false,
    });
  });

  it('counts the live lines of the previous term and flags a target with lines', async () => {
    const { service } = setup(
      line({ id: 'a', termId: 'past' }),
      line({ id: 'b', termId: 'past', feeTypeId: 'pta' }),
      line({
        id: 'c',
        termId: 'past',
        feeTypeId: 'pta',
        retiredAt: '2026-07-01T00:00:00.000Z',
      })
    );
    await expect(service.copySource(everyone, 'term-1')).resolves.toEqual({
      sourceTerm: {
        id: 'past',
        name: 'Third term',
        schoolYearName: '2025/2026',
      },
      liveLineCount: 2,
      targetHasLines: false,
    });
    const filled = setup(
      line({ id: 'a', termId: 'past' }),
      line({ id: 'b', termId: 'term-1' })
    );
    await expect(
      filled.service.copySource(everyone, 'term-1')
    ).resolves.toMatchObject({ liveLineCount: 1, targetHasLines: true });
  });
});

describe('FeeLineService.copySource for a campus-scoped caller', () => {
  it('names the source term but reports no school-wide counts', async () => {
    const { service } = setup(
      line({ id: 'a', termId: 'past' }),
      line({ id: 'b', termId: 'term-1' })
    );
    await expect(service.copySource(lekkiOnly, 'term-1')).resolves.toEqual({
      sourceTerm: {
        id: 'past',
        name: 'Third term',
        schoolYearName: '2025/2026',
      },
      liveLineCount: 0,
      targetHasLines: false,
    });
  });
});

describe('FeeLineService.copy', () => {
  it('refuses a campus-scoped member with 403 before looking at the term', async () => {
    const { service, lines } = setup(line({ termId: 'past' }));
    const refused = service.copy(lekkiOnly, { termId: 'elsewhere' });
    await expect(refused).rejects.toBeInstanceOf(ForbiddenException);
    await expect(refused).rejects.toThrow(FEE_EVERY_CAMPUS_MESSAGE);
    expect(lines.copies).toEqual([]);
  });

  it('answers 404 for a term outside the school', async () => {
    const { service } = setup();
    await expect(
      service.copy(everyone, { termId: 'elsewhere' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 400 when the term has ended', async () => {
    const { service } = setup(line({ termId: 'past' }));
    await expect(service.copy(everyone, { termId: 'past' })).rejects.toThrow(
      FEE_TERM_ENDED_MESSAGE
    );
  });

  it('answers 400 when there is no earlier term', async () => {
    const { service, lines } = setup();
    lines.terms.delete('past');
    const refused = service.copy(everyone, { termId: 'term-1' });
    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow(FEE_COPY_NO_SOURCE_MESSAGE);
  });

  it('answers 400 naming the source when it has no live lines', async () => {
    const { service, lines } = setup(
      line({ termId: 'past', retiredAt: '2026-07-01T00:00:00.000Z' })
    );
    const refused = service.copy(everyone, { termId: 'term-1' });
    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow(
      'Third term, 2025/2026 has no fees to copy.'
    );
    expect(lines.copies).toEqual([]);
  });

  it('answers 400 naming the source when every source line is retired during the copy', async () => {
    const { service, lines } = setup(
      line({ termId: 'past', retiredAt: '2026-07-01T00:00:00.000Z' })
    );
    vi.spyOn(lines, 'liveLineCount').mockResolvedValue(1);
    const refused = service.copy(everyone, { termId: 'term-1' });
    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow(
      'Third term, 2025/2026 has no fees to copy.'
    );
  });

  it('answers 409 naming the target when it already has a live line', async () => {
    const { service, lines } = setup(
      line({ id: 'a', termId: 'past' }),
      line({ id: 'b', termId: 'term-1' })
    );
    const refused = service.copy(everyone, { termId: 'term-1' });
    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toThrow(
      'First term, 2026/2027 already has fees. Change them one at a time instead.'
    );
    expect(lines.rows.filter((row) => row.termId === 'term-1')).toHaveLength(1);
  });

  it('treats a target with only retired lines as empty', async () => {
    const { service } = setup(
      line({ id: 'a', termId: 'past' }),
      line({
        id: 'b',
        termId: 'term-1',
        retiredAt: '2026-10-01T00:00:00.000Z',
      })
    );
    await expect(
      service.copy(everyone, { termId: 'term-1' })
    ).resolves.toMatchObject({ copied: 1 });
  });

  it('copies only the live lines and returns the count and source term', async () => {
    const { service, lines } = setup(
      line({ id: 'a', termId: 'past' }),
      line({ id: 'b', termId: 'past', feeTypeId: 'pta', name: 'PTA' }),
      line({
        id: 'c',
        termId: 'past',
        feeTypeId: 'pta',
        retiredAt: '2026-07-01T00:00:00.000Z',
      })
    );
    await expect(service.copy(everyone, { termId: 'term-1' })).resolves.toEqual(
      {
        copied: 2,
        sourceTerm: {
          id: 'past',
          name: 'Third term',
          schoolYearName: '2025/2026',
        },
      }
    );
    expect(lines.copies).toEqual([
      {
        organizationId: 'school-a',
        userId: 'caller',
        fromTermId: 'past',
        toTermId: 'term-1',
      },
    ]);
    const copied = lines.rows.filter((row) => row.termId === 'term-1');
    expect(copied.map((row) => row.name)).toEqual(['Tuition', 'PTA']);
    expect(lines.rows.filter((row) => row.termId === 'past')).toHaveLength(3);
  });
});

describe('FeeLineService activity rows', () => {
  it('records one finance row for a created every-campus line', async () => {
    const { service, lines } = setup();
    await service.create(everyone, input());
    expect(lines.recorded).toEqual([
      expect.objectContaining({
        organizationId: 'school-a',
        campusId: null,
        pillar: 'finance',
        kind: 'fee_line.created',
        actorUserId: 'caller',
        subjectType: 'fee_line',
        text: 'Chika Eze added Tuition (Tuition) for JSS 2, every campus, First term, 2026/2027: ₦180,000.',
      }),
    ]);
  });

  it('records a created campus line against its campus', async () => {
    const { service, lines } = setup();
    await service.create(lekkiOnly, input({ campusId: 'lekki' }));
    expect(lines.recorded).toHaveLength(1);
    expect(lines.recorded[0]).toMatchObject({
      campusId: 'lekki',
      kind: 'fee_line.created',
    });
    expect(lines.recorded[0]?.text).toContain('for JSS 2, Lekki,');
  });

  it('records the old and new amount when the amount changes', async () => {
    const { service, lines } = setup(
      line({ campusId: 'lekki', campusName: 'Lekki' })
    );
    await service.updateAmount(lekkiOnly, 'line-1', {
      amountMinor: 20_000_000,
    });
    expect(lines.recorded).toEqual([
      expect.objectContaining({
        campusId: 'lekki',
        kind: 'fee_line.amount_changed',
        text: 'Chika Eze changed Tuition for JSS 2, Lekki, First term, 2026/2027 from ₦180,000 to ₦200,000.',
        data: {
          feeLineId: 'line-1',
          termId: 'term-1',
          previousAmountMinor: 18_000_000,
          amountMinor: 20_000_000,
        },
      }),
    ]);
  });

  it('records a retirement with a null campus for an every-campus line', async () => {
    const { service, lines } = setup(line());
    await service.retire(everyone, 'line-1');
    expect(lines.recorded).toEqual([
      expect.objectContaining({
        campusId: null,
        kind: 'fee_line.retired',
        text: 'Chika Eze retired Tuition for JSS 2, every campus, First term, 2026/2027 (₦180,000).',
      }),
    ]);
  });

  it('records one row for a copy of every-campus lines only', async () => {
    const { service, lines } = setup(
      line({ id: 'a', termId: 'past' }),
      line({ id: 'b', termId: 'past', feeTypeId: 'pta', name: 'PTA' })
    );
    await service.copy(everyone, { termId: 'term-1' });
    expect(lines.recorded).toEqual([
      expect.objectContaining({
        campusId: null,
        kind: 'fee_lines.copied',
        subjectType: 'term',
        subjectId: 'term-1',
        text: 'Chika Eze copied 2 fee lines from Third term, 2025/2026 to First term, 2026/2027.',
        data: { fromTermId: 'past', toTermId: 'term-1', copied: 2 },
      }),
    ]);
  });

  it('splits a copy row by campus so a campus keeps only its own count', async () => {
    const { service, lines } = setup(
      line({ id: 'a', termId: 'past' }),
      line({ id: 'b', termId: 'past', feeTypeId: 'pta', name: 'PTA' }),
      line({ id: 'c', termId: 'past', campusId: 'lekki', name: 'Lekki' })
    );
    await service.copy(everyone, { termId: 'term-1' });
    expect(
      lines.recorded.map(({ campusId, text, data }) => ({
        campusId,
        text,
        copied: data?.['copied'],
      }))
    ).toEqual([
      {
        campusId: null,
        text: 'Chika Eze copied 2 fee lines from Third term, 2025/2026 to First term, 2026/2027 (for every campus).',
        copied: 2,
      },
      {
        campusId: 'lekki',
        text: 'Chika Eze copied 1 fee line from Third term, 2025/2026 to First term, 2026/2027 (for this campus).',
        copied: 1,
      },
    ]);
  });

  it('records nothing for a duplicate line', async () => {
    const { service, lines } = setup();
    lines.duplicate = true;
    await expect(service.create(everyone, input())).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(lines.recorded).toEqual([]);
  });

  it('records nothing for a retired line, an ended term or an out-of-scope line', async () => {
    const { service, lines } = setup(
      line({ retiredAt: '2026-10-02T00:00:00.000Z' }),
      line({ id: 'line-2', termId: 'past' }),
      line({ id: 'line-3', campusId: 'ikeja' })
    );
    await expect(
      service.updateAmount(everyone, 'line-1', { amountMinor: 1 })
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.retire(everyone, 'line-1')).rejects.toBeInstanceOf(
      ConflictException
    );
    await expect(
      service.updateAmount(everyone, 'line-2', { amountMinor: 1 })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.retire(everyone, 'line-2')).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(
      service.updateAmount(lekkiOnly, 'line-3', { amountMinor: 1 })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.retire(lekkiOnly, 'line-3')).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(lines.recorded).toEqual([]);
  });

  it('writes no row when the amount is unchanged', async () => {
    const { service, lines } = setup(line());
    const unchanged = await service.updateAmount(everyone, 'line-1', {
      amountMinor: 18_000_000,
    });
    expect(unchanged).toEqual(line());
    expect(lines.recorded).toEqual([]);
  });

  it('still refuses an unchanged amount on a term that has ended', async () => {
    const { service, lines } = setup(line({ termId: 'past' }));
    await expect(
      service.updateAmount(everyone, 'line-1', { amountMinor: 18_000_000 })
    ).rejects.toThrow(FEE_TERM_ENDED_MESSAGE);
    expect(lines.recorded).toEqual([]);
  });

  it('records nothing for a refused copy', async () => {
    const { service, lines } = setup(
      line({ id: 'a', termId: 'past' }),
      line({ id: 'b', termId: 'term-1' })
    );
    await expect(
      service.copy(everyone, { termId: 'term-1' })
    ).rejects.toBeInstanceOf(ConflictException);
    const empty = setup(
      line({ termId: 'past', retiredAt: '2026-07-01T00:00:00.000Z' })
    );
    await expect(
      empty.service.copy(everyone, { termId: 'term-1' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(lines.recorded).toEqual([]);
    expect(empty.lines.recorded).toEqual([]);
  });
});
