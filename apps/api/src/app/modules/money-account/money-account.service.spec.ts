import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  MONEY_ACCOUNT_BANK_NAME_MESSAGE,
  MONEY_ACCOUNT_GATEWAY_RETIRE_MESSAGE,
  MONEY_ACCOUNT_RETIRE_MESSAGE,
  MONEY_ACCOUNT_SCHOOL_WIDE_MESSAGE,
  type MoneyAccount,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { CampusService } from '../campus/campus.service';
import { FakeMoneyAccountRepository } from './fake-money-account.repository';
import { MoneyAccountService } from './money-account.service';

const ctxFor = (campusScope: OrgContext['campusScope']) =>
  ({
    organizationId: 'school-a',
    user: { id: 'caller', email: 'c@eduvault.test', name: 'Tunde Bakare' },
    campusScope,
  }) as OrgContext;

const everyone = ctxFor('all');
const lekkiOnly = ctxFor(['lekki']);

const account = (overrides: Partial<MoneyAccount> = {}): MoneyAccount => ({
  id: 'ma-1',
  name: 'GTBank current',
  kind: 'bank',
  campusId: null,
  campusName: null,
  bankName: 'GTBank',
  last4: '4417',
  ledgerAccountId: 'la-1',
  ledgerCode: 1210,
  balanceMinor: 0,
  retiredAt: null,
  ...overrides,
});

function setup(...seeded: MoneyAccount[]) {
  const repository = new FakeMoneyAccountRepository();
  for (const row of seeded) {
    repository.seed('school-a', row);
  }
  const campuses = {
    assertInScope: vi
      .fn()
      .mockImplementation((ctx: OrgContext, id: string) =>
        ctx.campusScope === 'all' || ctx.campusScope.includes(id)
          ? Promise.resolve()
          : Promise.reject(new NotFoundException('Campus not found'))
      ),
  };
  return {
    repository,
    campuses,
    service: new MoneyAccountService(
      repository,
      campuses as unknown as CampusService
    ),
  };
}

const bank = {
  name: 'GTBank current',
  kind: 'bank',
  bankName: 'GTBank',
  last4: '4417',
  campusId: null,
} as const;

describe('MoneyAccountService.create', () => {
  it('refuses a school-wide account without access to every campus', async () => {
    const { service, repository } = setup();
    const refused = service.create(lekkiOnly, bank);
    await expect(refused).rejects.toBeInstanceOf(ForbiddenException);
    await expect(refused).rejects.toThrow(MONEY_ACCOUNT_SCHOOL_WIDE_MESSAGE);
    expect(repository.created).toEqual([]);
  });

  it('checks a campus against the caller scope before creating', async () => {
    const { service, campuses, repository } = setup();
    await expect(
      service.create(lekkiOnly, { ...bank, campusId: 'ikeja' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.created).toEqual([]);
    await service.create(lekkiOnly, { ...bank, campusId: 'lekki' });
    expect(campuses.assertInScope).toHaveBeenCalledWith(lekkiOnly, 'lekki');
    expect(repository.created).toHaveLength(1);
  });

  it('lets someone who sees every campus add a school-wide account', async () => {
    const { service, repository } = setup();
    const created = await service.create(everyone, bank);
    expect(created.campusId).toBeNull();
    expect(repository.created[0]).toMatchObject({
      organizationId: 'school-a',
      userId: 'caller',
      name: 'GTBank current',
      bankName: 'GTBank',
      last4: '4417',
    });
  });

  it('keeps a bank name for a bank account only', async () => {
    const { service, repository } = setup();
    await service.create(everyone, {
      name: 'Front desk',
      kind: 'cash',
      bankName: 'GTBank',
      campusId: null,
    });
    expect(repository.created[0]?.bankName).toBeNull();
  });

  it('answers 409 naming the account when the name is taken', async () => {
    const { service, repository } = setup();
    repository.nameTaken = true;
    const refused = service.create(everyone, bank);
    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toThrow(
      'An account called GTBank current already exists.'
    );
  });
});

describe('MoneyAccountService.update', () => {
  it('answers 404 for an account out of scope, never 403', async () => {
    const { service } = setup(account());
    await expect(
      service.update(lekkiOnly, 'ma-1', { name: 'Renamed' })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update(everyone, 'missing', { name: 'Renamed' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a bank name on an account that is not a bank', async () => {
    const { service, repository } = setup(
      account({ kind: 'pos', bankName: null, campusId: 'lekki' })
    );
    const refused = service.update(everyone, 'ma-1', { bankName: 'GTBank' });
    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow(MONEY_ACCOUNT_BANK_NAME_MESSAGE);
    expect(repository.changes).toEqual([]);
  });

  it('takes a bank name on a bank account', async () => {
    const { service } = setup(account());
    const saved = await service.update(everyone, 'ma-1', {
      bankName: 'Zenith',
    });
    expect(saved.bankName).toBe('Zenith');
  });

  it('retires an account one way, and refuses to bring it back', async () => {
    const { service } = setup(account());
    const retired = await service.update(everyone, 'ma-1', { retired: true });
    expect(retired.retiredAt).not.toBeNull();
    const refused = service.update(everyone, 'ma-1', { retired: false });
    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow(MONEY_ACCOUNT_RETIRE_MESSAGE);
  });

  it('answers 409 when the Monnify collections account is retired, and leaves it open', async () => {
    const gateway = account({
      id: 'ma-gw',
      name: 'Monnify collections',
      kind: 'gateway',
      bankName: null,
      last4: null,
      ledgerCode: 1230,
    });
    const { service } = setup(gateway);
    const refused = service.update(everyone, 'ma-gw', { retired: true });
    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toThrow(MONEY_ACCOUNT_GATEWAY_RETIRE_MESSAGE);
    expect((await service.list(everyone)).items[0]?.retiredAt).toBeNull();
  });

  it('clears the last 4 with null and keeps it when left out', async () => {
    const { service } = setup(account());
    expect((await service.update(everyone, 'ma-1', { name: 'X' })).last4).toBe(
      '4417'
    );
    expect(
      (await service.update(everyone, 'ma-1', { last4: null })).last4
    ).toBeNull();
  });
});

describe('MoneyAccountService.list and listForRecording', () => {
  const schoolWide = account();
  const lekki = account({ id: 'ma-2', kind: 'pos', campusId: 'lekki' });
  const ikeja = account({ id: 'ma-3', kind: 'cash', campusId: 'ikeja' });

  it('hides school-wide accounts without every campus and counts them', async () => {
    const { service } = setup(schoolWide, lekki, ikeja);
    const list = await service.list(lekkiOnly);
    expect(list.items.map((row) => row.id)).toEqual(['ma-2']);
    expect(list.hiddenSchoolWideCount).toBe(1);
  });

  it('offers school-wide accounts for recording, but not retired or gateway ones', async () => {
    const { service } = setup(
      schoolWide,
      lekki,
      ikeja,
      account({ id: 'ma-4', retiredAt: '2026-10-01T09:00:00.000Z' }),
      account({ id: 'ma-5', kind: 'gateway' })
    );
    const options = await service.listForRecording(lekkiOnly);
    expect(options.map((option) => option.id)).toEqual(['ma-1', 'ma-2']);
  });
});
