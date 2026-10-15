import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
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
    sessionId: 'session-1',
    endsOn: '2026-12-18',
  });
  lines.terms.set('past', {
    id: 'past',
    sessionId: 'session-0',
    endsOn: '2026-07-24',
  });
  lines.levels.set('jss2', { id: 'jss2', name: 'JSS 2' });
  lines.feeTypes.set('tuition', { id: 'tuition', code: 4010, name: 'Tuition' });
  lines.feeTypes.set('pta', { id: 'pta', code: 4020, name: 'PTA fee' });
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
  it('retires a live line', async () => {
    const { service } = setup(line());
    const retired = await service.retire(everyone, 'line-1');
    expect(retired.retiredAt).not.toBeNull();
  });

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
