import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  LEDGER_ACCOUNT_PARENT_MESSAGE,
  LEDGER_CODE_TAKEN_MESSAGE,
  type OpeningBalances,
  type OpeningBalancesInput,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { ChartAccount } from '../../common/ledger';
import { FakeLedgerRepository } from './fake-ledger.repository';
import { LedgerService } from './ledger.service';

const ctxFor = (campusScope: OrgContext['campusScope']) =>
  ({
    organizationId: 'school-a',
    user: { id: 'caller', email: 'c@eduvault.test', name: 'Tunde Bakare' },
    campusScope,
  }) as OrgContext;

const everyone = ctxFor('all');
const lekkiOnly = ctxFor(['lekki']);

function setup() {
  const repository = new FakeLedgerRepository();
  const clock = new Clock();
  clock.set('2026-10-12');
  return { repository, service: new LedgerService(repository, clock) };
}

const opening = (input: OpeningBalancesInput): OpeningBalances => ({
  items: input.items ?? [],
  moneyAccounts: input.moneyAccounts ?? [],
});

const debt = {
  studentId: 'bola',
  amountMinor: 1_200_000,
  direction: 'debt',
  effectiveOn: '2026-09-01',
} as const;

describe('LedgerService.createAccount', () => {
  const feeIncome = {
    id: 'acc-4000',
    code: 4000,
    name: 'Fee income',
    type: 'income',
    systemKey: 'fee_income',
  } as const;

  it('adds a category under Fee income', async () => {
    const { service, repository } = setup();
    repository.accounts = [feeIncome];
    const created = await service.createAccount(everyone, {
      parentId: 'acc-4000',
      name: '  Sports  ',
    });
    expect(created).toMatchObject({
      name: 'Sports',
      parentId: 'acc-4000',
      type: 'income',
    });
  });

  it('records one fee_type.created row for a saved account', async () => {
    const { service, repository } = setup();
    repository.accounts = [feeIncome];
    await service.createAccount(everyone, {
      parentId: 'acc-4000',
      name: 'Sports',
    });
    expect(repository.recorded).toHaveLength(1);
    expect(repository.recorded[0]).toMatchObject({
      organizationId: 'school-a',
      campusId: null,
      kind: 'fee_type.created',
      actorUserId: 'caller',
      subjectType: 'fee_type',
      subjectId: 'new-account',
    });
  });

  it('records nothing for a refused account', async () => {
    const { service, repository } = setup();
    repository.accounts = [
      feeIncome,
      { ...feeIncome, id: 'acc-4010', code: 4010, systemKey: null },
    ];
    const create = (parentId: string) =>
      service.createAccount(everyone, { parentId, name: 'Sports' });
    repository.outcome = { status: 'name_taken' };
    await expect(create('acc-4000')).rejects.toBeInstanceOf(ConflictException);
    repository.outcome = { status: 'code_taken' };
    await expect(create('acc-4000')).rejects.toBeInstanceOf(ConflictException);
    repository.outcome = undefined;
    await expect(create('elsewhere')).rejects.toBeInstanceOf(NotFoundException);
    await expect(create('acc-4010')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(repository.recorded).toEqual([]);
  });

  it('answers 400 for any other parent, built-in or not', async () => {
    const { service, repository } = setup();
    repository.accounts = [
      {
        ...feeIncome,
        id: 'acc-1200',
        code: 1200,
        type: 'asset',
        systemKey: 'money_accounts',
      },
      { ...feeIncome, id: 'acc-4010', code: 4010, systemKey: null },
    ];
    for (const parentId of ['acc-1200', 'acc-4010']) {
      const refused = service.createAccount(everyone, {
        parentId,
        name: 'Sports',
      });
      await expect(refused).rejects.toBeInstanceOf(BadRequestException);
      await expect(refused).rejects.toThrow(LEDGER_ACCOUNT_PARENT_MESSAGE);
    }
  });

  it('answers 404 for a parent that is not in the school', async () => {
    const { service } = setup();
    await expect(
      service.createAccount(everyone, { parentId: 'elsewhere', name: 'Sports' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 409 naming the category on a duplicate, and on a code race', async () => {
    const { service, repository } = setup();
    repository.accounts = [feeIncome];
    repository.outcome = { status: 'name_taken' };
    const duplicate = service.createAccount(everyone, {
      parentId: 'acc-4000',
      name: 'tuition',
    });
    await expect(duplicate).rejects.toBeInstanceOf(ConflictException);
    await expect(duplicate).rejects.toThrow(
      'A category called tuition already exists here.'
    );
    repository.outcome = { status: 'code_taken' };
    await expect(
      service.createAccount(everyone, { parentId: 'acc-4000', name: 'Sports' })
    ).rejects.toThrow(LEDGER_CODE_TAKEN_MESSAGE);
  });
});

const chartRow = (
  code: number,
  extra: Partial<ChartAccount> = {}
): ChartAccount => ({
  id: `acc-${code}`,
  code,
  name: `Account ${code}`,
  type: 'income',
  parentId: null,
  systemKey: null,
  debitMinor: 0,
  creditMinor: 0,
  ...extra,
});

describe('LedgerService.listAccounts', () => {
  it('rolls children up, signs by type, hides rows and flags a scoped viewer', async () => {
    const { service, repository } = setup();
    repository.chartRows = [
      chartRow(4000, { systemKey: 'fee_income' }),
      chartRow(4010, { parentId: 'acc-4000', creditMinor: 700 }),
      chartRow(4060, {
        parentId: 'acc-4000',
        systemKey: 'other_charges',
        creditMinor: 300,
      }),
      chartRow(2100, {
        type: 'liability',
        systemKey: 'customer_credit_refunds',
      }),
      chartRow(1200, { type: 'asset', debitMinor: 900, creditMinor: 400 }),
    ];
    const everything = await service.listAccounts(everyone);
    expect(everything.scoped).toBe(false);
    expect(
      everything.items.map((item) => [item.code, item.balanceMinor])
    ).toEqual([
      [1200, 500],
      [4000, 1000],
      [4010, 700],
    ]);
    expect((await service.listAccounts(lekkiOnly)).scoped).toBe(true);
    expect(repository.scopes.at(-1)?.campusScope).toEqual(['lekki']);
  });
});

describe('LedgerService.postOpening', () => {
  it('posts a debt on the student campus and reports nothing skipped', async () => {
    const { service, repository } = setup();
    repository.campusOf = new Map([['bola', 'lekki']]);
    const result = await service.postOpening(
      everyone,
      opening({ items: [debt] })
    );
    expect(result).toEqual({ posted: 1, skipped: [] });
    const [entry] = repository.posted[0]?.entries ?? [];
    expect(entry?.reference).toBe('OPEN-bola');
    expect(
      entry?.lines.map((line) => [
        line.ledgerAccountId,
        line.campusId,
        line.debitMinor,
        line.creditMinor,
      ])
    ).toEqual([
      ['acc-1100', 'lekki', 1_200_000, 0],
      ['acc-3000', 'lekki', 0, 1_200_000],
    ]);
  });

  it('posts a credit with both sides reversed', async () => {
    const { service, repository } = setup();
    repository.campusOf = new Map([['david', 'ikeja']]);
    await service.postOpening(
      everyone,
      opening({
        items: [
          {
            ...debt,
            studentId: 'david',
            direction: 'credit',
            amountMinor: 500_000,
          },
        ],
      })
    );
    const [entry] = repository.posted[0]?.entries ?? [];
    expect(
      entry?.lines.map((line) => [
        line.debitMinor,
        line.creditMinor,
        line.campusId,
      ])
    ).toEqual([
      [0, 500_000, 'ikeja'],
      [500_000, 0, 'ikeja'],
    ]);
  });

  it('uses the account campus for a go-live balance, null for a school-wide one', async () => {
    const { service, repository } = setup();
    repository.moneyRows = [
      { id: 'ma-1', campusId: null, ledgerAccountId: 'acc-1210' },
      { id: 'ma-2', campusId: 'lekki', ledgerAccountId: 'acc-1220' },
    ];
    const result = await service.postOpening(
      everyone,
      opening({
        moneyAccounts: [
          {
            moneyAccountId: 'ma-1',
            amountMinor: 9_500_000,
            effectiveOn: '2026-09-01',
          },
          {
            moneyAccountId: 'ma-2',
            amountMinor: 4_200_000,
            effectiveOn: '2026-09-01',
          },
        ],
      })
    );
    expect(result.posted).toBe(2);
    const campuses = repository.posted[0]?.entries.map(
      (entry) => entry.lines[0]?.campusId
    );
    expect(campuses).toEqual([null, 'lekki']);
  });

  it('reports a reference already posted and posts only the new one', async () => {
    const { service, repository } = setup();
    repository.campusOf = new Map([
      ['bola', 'lekki'],
      ['kunle', 'lekki'],
    ]);
    repository.alreadyPosted.add('OPEN-bola');
    const result = await service.postOpening(
      everyone,
      opening({ items: [debt, { ...debt, studentId: 'kunle' }] })
    );
    expect(result).toEqual({
      posted: 1,
      skipped: [{ studentId: 'bola', reason: 'already_posted' }],
    });
  });

  it('answers 404 for a student out of scope and posts nothing', async () => {
    const { service, repository } = setup();
    repository.campusOf = new Map([['kunle', 'lekki']]);
    await expect(
      service.postOpening(
        lekkiOnly,
        opening({ items: [{ ...debt, studentId: 'kunle' }, debt] })
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.posted).toEqual([]);
  });

  it('answers 404 for a money account out of scope and posts nothing', async () => {
    const { service, repository } = setup();
    await expect(
      service.postOpening(
        lekkiOnly,
        opening({
          moneyAccounts: [
            {
              moneyAccountId: 'ma-9',
              amountMinor: 1,
              effectiveOn: '2026-09-01',
            },
          ],
        })
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.posted).toEqual([]);
  });
});
