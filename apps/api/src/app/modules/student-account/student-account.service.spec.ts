import { NotFoundException } from '@nestjs/common';
import type { StatementFamily } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { MovementRecord } from './statement-assembly';
import {
  StudentAccountRepository,
  type BalanceCounts,
  type BalancePageRecord,
  type GuardianChildren,
  type StudentHeader,
} from './student-account.repository';
import { StudentAccountService } from './student-account.service';

const ctxOf = (campusScope: OrgContext['campusScope']) =>
  ({
    organizationId: 'school-a',
    user: { id: 'chika', email: 'c@eduvault.test', name: 'Chika' },
    campusScope,
  }) as OrgContext;

const everyone = ctxOf('all');
const familyOf = (studentScope: string[]): OrgContext => ({
  ...ctxOf([]),
  studentScope,
});
const lekkiOnly = ctxOf(['lekki']);

const header = (id: string): StudentHeader => ({
  id,
  name: `Child ${id}`,
  admissionNumber: `GF-${id}`,
  className: 'JSS 1 Gold',
  campusName: 'Lekki',
  archived: false,
});

const movement = (
  overrides: Partial<MovementRecord> & Pick<MovementRecord, 'kind'>
): MovementRecord => ({
  entryId: 'entry',
  sequence: 1,
  effectiveOn: '2026-09-01',
  reference: 'REF',
  memo: null,
  debitMinor: 0,
  creditMinor: 0,
  invoice: null,
  payment: null,
  ...overrides,
});

class FakeAccounts extends StudentAccountRepository {
  headers = new Map<string, StudentHeader>();
  history = new Map<string, MovementRecord[]>();
  guardian: GuardianChildren | undefined;
  familyOf: StatementFamily = null;
  page: BalancePageRecord = { items: [], total: 0 };
  counts: BalanceCounts = {
    totalOwedMinor: 0,
    studentsOwing: 0,
    studentsInScope: 0,
  };
  received = { minor: 0, count: 0 };
  names: string[] = [];

  currency() {
    return Promise.resolve('NGN');
  }

  balancePage() {
    return Promise.resolve(this.page);
  }

  balanceCounts() {
    return Promise.resolve(this.counts);
  }

  receivedThisTerm() {
    return Promise.resolve(this.received);
  }

  campusNames() {
    return Promise.resolve(this.names);
  }

  studentHeader(_scope: unknown, studentId: string) {
    return Promise.resolve(this.headers.get(studentId));
  }

  movements(_organizationId: string, studentId: string) {
    return Promise.resolve(this.history.get(studentId) ?? []);
  }

  family() {
    return Promise.resolve(this.familyOf);
  }

  guardianChildren() {
    return Promise.resolve(this.guardian);
  }
}

const setup = () => {
  const accounts = new FakeAccounts();
  const clock = new Clock({ NODE_ENV: 'test' });
  clock.set('2026-10-07');
  return { accounts, service: new StudentAccountService(accounts, clock) };
};

const query = { filter: 'owing', page: 1, pageSize: 10 } as const;

describe('StudentAccountService.balances', () => {
  it('puts Paid and Total from each student’s entries beside the balance', async () => {
    const { accounts, service } = setup();
    accounts.page = {
      total: 1,
      items: [
        {
          studentId: 's1',
          name: 'Ada Okeke',
          admissionNumber: 'GF-0001',
          lifecycle: 'active',
          className: 'JSS 1 Gold',
          guardian: { id: 'g1', name: 'Ngozi Okeke', phone: '0801' },
          balanceMinor: 4_000_000,
          kindMovements: [
            { kind: 'invoice', debitMinor: 22_000_000, creditMinor: 1_100_000 },
            { kind: 'payment', debitMinor: 0, creditMinor: 16_900_000 },
          ],
        },
      ],
    };

    const list = await service.balances(everyone, query);

    expect(list.items).toEqual([
      {
        studentId: 's1',
        name: 'Ada Okeke',
        admissionNumber: 'GF-0001',
        lifecycle: 'active',
        className: 'JSS 1 Gold',
        guardian: { id: 'g1', name: 'Ngozi Okeke', phone: '0801' },
        balanceMinor: 4_000_000,
        totalMinor: 22_000_000,
        paidMinor: 16_900_000,
      },
    ]);
    expect(list.total).toBe(1);
  });

  it('assembles the tiles for the whole school', async () => {
    const { accounts, service } = setup();
    accounts.counts = {
      totalOwedMinor: 8_000_000,
      studentsOwing: 2,
      studentsInScope: 30,
    };
    accounts.received = { minor: 50_000_000, count: 7 };

    const { summary } = await service.balances(everyone, query);

    expect(summary).toEqual({
      totalOwedMinor: 8_000_000,
      studentsOwing: 2,
      studentsInScope: 30,
      receivedThisTermMinor: 50_000_000,
      paymentsThisTerm: 7,
      scopeNote: 'All campuses',
    });
  });

  it('names the campuses of a campus-scoped caller', async () => {
    const { accounts, service } = setup();
    accounts.names = ['Lekki'];

    const { summary } = await service.balances(lekkiOnly, query);

    expect(summary.scopeNote).toBe('Lekki campus');
  });
});

describe('StudentAccountService.statement', () => {
  it('answers 404 when the student is out of scope or in another school', async () => {
    const { service } = setup();
    await expect(
      service.statement(lekkiOnly, 'nobody', { pageSize: 10 })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('opens on the last page with the totals, unpaid charges and family', async () => {
    const { accounts, service } = setup();
    accounts.headers.set('s1', header('s1'));
    accounts.familyOf = {
      guardianId: 'g1',
      guardianName: 'Ngozi',
      childCount: 3,
    };
    accounts.history.set(
      's1',
      Array.from({ length: 12 }, (_, index) =>
        movement({
          kind: 'invoice',
          entryId: `e${index}`,
          reference: `CHG-${index}`,
          debitMinor: 1000,
          effectiveOn: `2026-09-${String(index + 1).padStart(2, '0')}`,
        })
      )
    );

    const statement = await service.statement(everyone, 's1', { pageSize: 5 });

    expect(statement).toMatchObject({
      total: 12,
      page: 3,
      pageSize: 5,
      totals: { balanceMinor: 12_000, totalMinor: 12_000, paidMinor: 0 },
      family: { guardianId: 'g1', childCount: 3 },
    });
    expect(statement.rows.map((row) => row.reference)).toEqual([
      'CHG-10',
      'CHG-11',
    ]);
    expect(statement.unpaid).toHaveLength(12);
    const first = await service.statement(everyone, 's1', {
      page: 1,
      pageSize: 5,
    });
    expect(first.rows).toHaveLength(5);
  });
});

describe('StudentAccountService.guardianStatement', () => {
  it('answers 404 when no child is in reach', async () => {
    const { service } = setup();
    await expect(
      service.guardianStatement(lekkiOnly, 'g1')
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds what the children owe and keeps one child’s credit apart', async () => {
    const { accounts, service } = setup();
    accounts.guardian = {
      guardian: { id: 'g1', name: 'Ngozi Okeke' },
      studentIds: ['ada', 'chidi', 'tobi'],
    };
    for (const [id, debit, credit] of [
      ['ada', 6_000_000, 0],
      ['chidi', 2_000_000, 0],
      ['tobi', 0, 500_000],
    ] as const) {
      accounts.headers.set(id, header(id));
      accounts.history.set(id, [
        movement({
          kind: debit > 0 ? 'invoice' : 'opening',
          debitMinor: debit,
          creditMinor: credit,
        }),
      ]);
    }

    const family = await service.guardianStatement(everyone, 'g1');

    expect(family.guardian).toEqual({ id: 'g1', name: 'Ngozi Okeke' });
    expect(family.familyTotalMinor).toBe(8_000_000);
    expect(family.creditMinor).toBe(500_000);
    expect(family.children.map((child) => child.student.id)).toEqual([
      'ada',
      'chidi',
      'tobi',
    ]);
  });
});

const history = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    movement({
      kind: 'invoice',
      entryId: `e${index}`,
      reference: `CHG-${index}`,
      debitMinor: 1000,
      effectiveOn: `2026-09-${String(index + 1).padStart(2, '0')}`,
    })
  );

describe('StudentAccountService.ownStatement', () => {
  it('totals the entries with no campus scope and no header lookup', async () => {
    const { accounts, service } = setup();
    accounts.history.set('s1', [
      movement({ kind: 'invoice', debitMinor: 22_000_000 }),
      movement({ kind: 'payment', creditMinor: 16_900_000 }),
    ]);

    const statement = await service.ownStatement(familyOf(['s1']), 's1', {
      pageSize: 10,
    });

    expect(statement.currency).toBe('NGN');
    expect(statement.totals).toMatchObject({
      balanceMinor: 5_100_000,
      totalMinor: 22_000_000,
      paidMinor: 16_900_000,
    });
  });

  it('opens on the last page unless a page is asked for', async () => {
    const { accounts, service } = setup();
    accounts.history.set('s1', history(12));

    const last = await service.ownStatement(familyOf(['s1']), 's1', {
      pageSize: 5,
    });
    const first = await service.ownStatement(familyOf(['s1']), 's1', {
      page: 1,
      pageSize: 5,
    });

    expect(last).toMatchObject({ total: 12, page: 3, pageSize: 5 });
    expect(last.rows.map((row) => row.reference)).toEqual(['CHG-10', 'CHG-11']);
    expect(first.rows).toHaveLength(5);
  });

  it('lists unpaid charges oldest first, a payment covering the oldest', async () => {
    const { accounts, service } = setup();
    accounts.history.set('s1', [
      movement({
        kind: 'invoice',
        sequence: 1,
        reference: 'CHG-OLD',
        debitMinor: 1000,
        effectiveOn: '2026-09-01',
      }),
      movement({
        kind: 'invoice',
        sequence: 2,
        reference: 'CHG-MID',
        debitMinor: 1000,
        effectiveOn: '2026-09-15',
      }),
      movement({
        kind: 'invoice',
        sequence: 3,
        reference: 'CHG-NEW',
        debitMinor: 1000,
        effectiveOn: '2026-10-01',
      }),
      movement({
        kind: 'payment',
        sequence: 4,
        creditMinor: 1500,
        effectiveOn: '2026-10-02',
      }),
    ]);

    const { unpaid } = await service.ownStatement(familyOf(['s1']), 's1', {
      pageSize: 10,
    });

    expect(unpaid.map((item) => item.reference)).toEqual([
      'CHG-MID',
      'CHG-NEW',
    ]);
    expect(unpaid.map((item) => item.outstandingMinor)).toEqual([500, 1000]);
  });
});

describe('StudentAccountService own reads outside student scope', () => {
  it('answers 404 for a student the caller is not linked to', async () => {
    const { accounts, service } = setup();
    accounts.history.set('other', [
      movement({ kind: 'invoice', debitMinor: 1000 }),
    ]);

    await expect(
      service.ownStatement(familyOf(['mine']), 'other', { pageSize: 10 })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.ownBalances(familyOf(['mine']), ['mine', 'other'])
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.ownBalances(familyOf([]), ['other'])
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('describes cancellations and adjustments without the staff memo', async () => {
    const { accounts, service } = setup();
    accounts.history.set('s1', [
      movement({
        kind: 'payment_void',
        sequence: 1,
        debitMinor: 1000,
        memo: 'Void of RCT-2026-00088: Keyed the wrong amount',
      }),
      movement({
        kind: 'adjustment',
        sequence: 2,
        debitMinor: 500,
        memo: 'Refund: parent was rude',
      }),
    ]);

    const { rows } = await service.ownStatement(familyOf(['s1']), 's1', {
      pageSize: 10,
    });

    expect(rows.map((row) => row.description)).toEqual([
      'Payment RCT-2026-00088 cancelled',
      'Refund',
    ]);
  });
});

describe('StudentAccountService.ownBalances', () => {
  it('gives each student their balance and keeps credit negative', async () => {
    const { accounts, service } = setup();
    accounts.history.set('ada', [
      movement({ kind: 'invoice', debitMinor: 6_000_000 }),
    ]);
    accounts.history.set('tobi', [
      movement({ kind: 'opening', creditMinor: 500_000 }),
    ]);

    const { currency, balances } = await service.ownBalances(
      familyOf(['ada', 'tobi', 'new']),
      ['ada', 'tobi', 'new']
    );

    expect(currency).toBe('NGN');
    expect(Object.fromEntries(balances)).toEqual({
      ada: 6_000_000,
      tobi: -500_000,
      new: 0,
    });
  });

  it('is empty for no students', async () => {
    const { service } = setup();
    expect((await service.ownBalances(familyOf([]), [])).balances.size).toBe(0);
  });
});
