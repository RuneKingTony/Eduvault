import { NotFoundException } from '@nestjs/common';
import { APPROVAL_PAGE_SIZE } from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import {
  ApprovalRegistry,
  type ApprovalProvider,
  type WaitingApproval,
} from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import type { CampusService } from '../campus/campus.service';
import { ApprovalsRepository } from './approvals.repository';
import { ApprovalsService } from './approvals.service';

const waiting = (over: Partial<WaitingApproval>): WaitingApproval => ({
  kind: 'write_off',
  id: 'a',
  details: 'Bola Ade: Left the school',
  amountMinor: 1_200_000,
  amountText: null,
  createdById: 'chika',
  createdByName: 'Chika',
  createdAt: '2026-10-16T08:00:00.000Z',
  campusId: 'lekki',
  ...over,
});

const provider = (...items: WaitingApproval[]): ApprovalProvider => ({
  waiting: () => Promise.resolve(items),
});

const org = (
  userId: string,
  options: {
    approve?: boolean;
    acting?: boolean;
    permissions?: Permission[];
    campusScope?: OrgContext['campusScope'];
  } = {}
) =>
  ({
    organizationId: 'school-a',
    user: { id: userId },
    campusScope: options.campusScope ?? 'all',
    permissions: toPermissionMap(
      options.permissions ??
        (options.approve === false ? ['payment:read'] : ['adjustment:approve'])
    ),
    acting: options.acting === true ? { writes: false } : null,
  }) as unknown as OrgContext;

const page1 = { page: 1, includeOthers: false };

class FakeApprovals extends ApprovalsRepository {
  currency() {
    return Promise.resolve('NGN');
  }
}

const inScope = {
  assertInScope: () => Promise.resolve(),
} as unknown as CampusService;

const serviceWith = (
  campuses: CampusService,
  ...providers: ApprovalProvider[]
) => {
  const registry = new ApprovalRegistry();
  for (const source of providers) {
    registry.add(source);
  }
  return new ApprovalsService(registry, new FakeApprovals(), campuses);
};

const serviceOver = (...providers: ApprovalProvider[]) =>
  serviceWith(inScope, ...providers);

const voidItem = waiting({
  kind: 'payment_void',
  id: 'void-1',
  details: 'RCT-2026-00098 from Mrs Danjuma: Wrong child',
  amountMinor: 2_000_000,
  createdAt: '2026-10-15T08:00:00.000Z',
});
const discountItem = waiting({
  kind: 'discount',
  id: 'disc-1',
  details: 'Halima: Scholarship (50%)',
  amountMinor: null,
  amountText: '50% off',
  createdAt: '2026-10-17T08:00:00.000Z',
});
const balanceItem = waiting({ id: 'adj-1' });

describe('ApprovalsService.list', () => {
  it('merges every provider and puts the oldest request first', async () => {
    const service = serviceOver(
      provider(discountItem),
      provider(balanceItem),
      provider(voidItem)
    );

    const list = await service.list(org('grace'), page1);

    expect(list.items.map((item) => item.id)).toEqual([
      'void-1',
      'adj-1',
      'disc-1',
    ]);
    expect(list.total).toBe(3);
    expect(list.currency).toBe('NGN');
  });

  it('maps the kind label, details, amount text and creator for each item', async () => {
    const service = serviceOver(provider(voidItem, discountItem));
    const [one, second] = (await service.list(org('grace'), page1)).items;
    expect(one).toMatchObject({
      kind: 'payment_void',
      label: 'Cancel a payment',
      details: 'RCT-2026-00098 from Mrs Danjuma: Wrong child',
      amountMinor: 2_000_000,
      amountText: null,
      createdBy: { id: 'chika', name: 'Chika' },
      decide: 'yes',
    });
    expect(second).toMatchObject({
      label: 'Discount',
      amountMinor: null,
      amountText: '50% off',
    });
  });

  it('marks the viewer’s own request as own and still lists it', async () => {
    const service = serviceOver(provider(balanceItem, voidItem));
    const list = await service.list(org('chika'), page1);
    expect(list.items.map((item) => item.decide)).toEqual(['own', 'own']);
  });

  it('breaks a tie on time by id so the order is stable', async () => {
    const same = '2026-10-16T08:00:00.000Z';
    const service = serviceOver(
      provider(
        waiting({ id: 'b', createdAt: same }),
        waiting({ id: 'a', createdAt: same })
      )
    );
    expect(
      (await service.list(org('grace'), page1)).items.map((item) => item.id)
    ).toEqual(['a', 'b']);
  });

  it('pages ten at a time', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      waiting({
        id: `adj-${String(index).padStart(2, '0')}`,
        createdAt: `2026-10-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
      })
    );
    const service = serviceOver(provider(...many));
    const onFirst = await service.list(org('grace'), page1);
    const second = await service.list(org('grace'), { ...page1, page: 2 });
    expect(onFirst.items).toHaveLength(APPROVAL_PAGE_SIZE);
    expect(second.items.map((item) => item.id)).toEqual(['adj-10', 'adj-11']);
    expect(second.total).toBe(12);
  });

  it('shows nothing to a member who cannot approve', async () => {
    const service = serviceOver(provider(voidItem));
    expect(await service.list(org('yemi', { approve: false }), page1)).toEqual({
      currency: 'NGN',
      items: [],
      total: 0,
      othersCount: 0,
      pillars: { money: 0, leave: 0 },
    });
  });

  it('shows the queue to a super admin acting in the school', async () => {
    const service = serviceOver(provider(voidItem));
    const list = await service.list(
      org('root', { approve: false, acting: true }),
      page1
    );
    expect(list.items).toHaveLength(1);
  });
});

const inCampus = (campusId: string, over: Partial<WaitingApproval>) =>
  waiting({ campusId, ...over });

const scopedProvider = (...items: WaitingApproval[]) => ({
  waiting: vi.fn((scope: Parameters<ApprovalProvider['waiting']>[0]) =>
    Promise.resolve(
      items.filter(
        (item) =>
          scope.campusScope === 'all' ||
          (item.campusId !== null && scope.campusScope.includes(item.campusId))
      )
    )
  ),
});

describe('ApprovalsService.list campus picker', () => {
  const lekkiVoid = inCampus('lekki', {
    id: 'lekki-void',
    kind: 'payment_void',
  });
  const ikejaLeave = inCampus('ikeja', {
    id: 'ikeja-leave',
    kind: 'leave',
    createdById: 'ayo',
  });
  const ikejaOther = inCampus('ikeja', { id: 'ikeja-money' });

  it('hands every provider the picked campus as the scope', async () => {
    const source = scopedProvider(lekkiVoid, ikejaLeave);
    const assertInScope = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith(
      { assertInScope } as unknown as CampusService,
      source
    );
    const grace = org('grace');

    const list = await service.list(grace, { ...page1, campusId: 'lekki' });

    expect(assertInScope).toHaveBeenCalledWith(grace, 'lekki');
    expect(source.waiting).toHaveBeenCalledWith({
      organizationId: 'school-a',
      campusScope: ['lekki'],
    });
    expect(list.items.map((item) => item.id)).toEqual(['lekki-void']);
  });

  it('keeps the viewer’s own campus scope when no campus is picked', async () => {
    const source = scopedProvider(lekkiVoid, ikejaOther);
    const service = serviceWith(inScope, source);

    const list = await service.list(
      org('grace', { campusScope: ['lekki', 'ikeja'] }),
      page1
    );

    expect(source.waiting).toHaveBeenCalledWith({
      organizationId: 'school-a',
      campusScope: ['lekki', 'ikeja'],
    });
    expect(list.total).toBe(2);
  });

  it('counts others and pillars from the narrowed list', async () => {
    const service = serviceOver(
      scopedProvider(lekkiVoid, ikejaLeave, ikejaOther)
    );
    const grace = org('grace', {
      permissions: ['adjustment:approve', 'adjustment:read'],
    });

    const all = await service.list(grace, page1);
    const ikeja = await service.list(grace, { ...page1, campusId: 'ikeja' });

    expect(all.othersCount).toBe(1);
    expect(all.pillars).toEqual({ money: 2, leave: 0 });
    expect(ikeja.othersCount).toBe(1);
    expect(ikeja.pillars).toEqual({ money: 1, leave: 0 });
    expect(ikeja.total).toBe(1);
  });

  it('never narrows the summary', async () => {
    const source = scopedProvider(lekkiVoid, ikejaOther);
    const summary = await serviceWith(inScope, source).summary(org('grace'));

    expect(source.waiting).toHaveBeenCalledWith({
      organizationId: 'school-a',
      campusScope: 'all',
    });
    expect(summary.waitingForMe).toBe(2);
  });

  it('passes on the 404 and asks no provider when the campus is out of scope', async () => {
    const source = scopedProvider(lekkiVoid);
    const service = serviceWith(
      {
        assertInScope: () =>
          Promise.reject(new NotFoundException('Campus not found')),
      } as unknown as CampusService,
      source
    );

    await expect(
      service.list(org('grace'), { ...page1, campusId: 'elsewhere' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(source.waiting).not.toHaveBeenCalled();
  });

  it('gives a member who cannot approve an empty list for a valid campus', async () => {
    const source = scopedProvider(lekkiVoid);
    const service = serviceWith(inScope, source);

    const list = await service.list(org('yemi', { approve: false }), {
      ...page1,
      campusId: 'lekki',
    });

    expect(list.items).toEqual([]);
    expect(list.total).toBe(0);
    expect(source.waiting).not.toHaveBeenCalled();
  });
});

const leaveItem = waiting({
  kind: 'leave',
  id: 'leave-1',
  details: 'Ayo Bassey · Sick leave · 12 Oct 2026 – 13 Oct 2026. Malaria',
  amountMinor: null,
  amountText: '2 days',
  createdById: 'ayo',
  createdByName: 'Ayo Bassey',
  createdAt: '2026-10-16T09:00:00.000Z',
});
const leaveOnly: Permission[] = ['leave:approve'];

describe('ApprovalsService leave rows', () => {
  it('lists leave to a leave approver as theirs to decide, and a money row only behind others with read access', async () => {
    const service = serviceOver(provider(leaveItem, voidItem));
    const grace = org('grace', { permissions: leaveOnly });
    const list = await service.list(grace, page1);
    expect(list.items.map((item) => [item.id, item.decide])).toEqual([
      ['leave-1', 'yes'],
    ]);
    expect(list.othersCount).toBe(0);

    const reader = org('grace', {
      permissions: ['leave:approve', 'adjustment:read'],
    });
    expect((await service.list(reader, page1)).othersCount).toBe(1);
    const withOthers = await service.list(reader, {
      ...page1,
      includeOthers: true,
    });
    expect(withOthers.items.map((item) => [item.id, item.decide])).toEqual([
      ['void-1', 'other'],
      ['leave-1', 'yes'],
    ]);
    expect(withOthers.total).toBe(2);
  });

  it('gives a money approver the leave rows as someone else’s to decide, behind the switch', async () => {
    const service = serviceOver(provider(leaveItem, voidItem));
    const bursarBoss = org('boss');
    const hidden = await service.list(bursarBoss, page1);
    expect(hidden.items.map((item) => item.id)).toEqual(['void-1']);
    expect(hidden).toMatchObject({ total: 1, othersCount: 1 });
    const shown = await service.list(bursarBoss, {
      ...page1,
      includeOthers: true,
    });
    expect(shown.items.map((item) => [item.id, item.decide])).toEqual([
      ['void-1', 'yes'],
      ['leave-1', 'other'],
    ]);
  });

  it('counts each pillar and filters the table to one', async () => {
    const service = serviceOver(provider(leaveItem, voidItem, balanceItem));
    const both = org('grace', {
      permissions: ['adjustment:approve', 'leave:approve'],
    });

    const all = await service.list(both, page1);
    const leave = await service.list(both, { ...page1, pillar: 'leave' });
    const money = await service.list(both, { ...page1, pillar: 'money' });

    expect(all).toMatchObject({ total: 3, pillars: { money: 2, leave: 1 } });
    expect(leave.items.map((item) => item.id)).toEqual(['leave-1']);
    expect(leave).toMatchObject({ total: 1, pillars: { money: 2, leave: 1 } });
    expect(money.items.map((item) => item.id)).toEqual(['void-1', 'adj-1']);
    expect(money.total).toBe(2);
  });

  it('counts the others’ rows in the pillars only once the switch adds them', async () => {
    const service = serviceOver(provider(leaveItem, voidItem));
    const boss = org('boss');
    expect((await service.list(boss, page1)).pillars).toEqual({
      money: 1,
      leave: 0,
    });
    expect(
      (await service.list(boss, { ...page1, includeOthers: true })).pillars
    ).toEqual({ money: 1, leave: 1 });
  });

  it('marks the requester’s own leave as own', async () => {
    const service = serviceOver(provider(leaveItem));
    const ayo = org('ayo', { permissions: leaveOnly });
    expect((await service.list(ayo, page1)).items[0]?.decide).toBe('own');
  });

  it('lets a super admin acting in the school decide everything', async () => {
    const service = serviceOver(provider(leaveItem, voidItem));
    const list = await service.list(
      org('root', { approve: false, acting: true }),
      page1
    );
    expect(list.items.map((item) => item.decide)).toEqual(['yes', 'yes']);
  });

  it('shows nothing to someone holding neither approve permission', async () => {
    const service = serviceOver(provider(leaveItem, voidItem));
    expect(
      await service.list(org('yemi', { approve: false }), {
        ...page1,
        includeOthers: true,
      })
    ).toMatchObject({ items: [], total: 0, othersCount: 0 });
  });

  it('counts leave in the summary only for a leave approver and leaves it out of the payments count', async () => {
    const service = serviceOver(provider(leaveItem, voidItem, balanceItem));
    const both = org('grace', {
      permissions: ['adjustment:approve', 'leave:approve'],
    });
    expect(await service.summary(both)).toMatchObject({
      waitingForMe: 3,
      byNav: { approvals: 3, payments: 2 },
    });
    const money = await service.summary(org('boss'));
    expect(money).toMatchObject({
      waitingForMe: 2,
      byNav: { approvals: 2, payments: 2 },
    });
    expect(money.preview.map((item) => item.id)).not.toContain('leave-1');
    const leave = await service.summary(
      org('grace', { permissions: leaveOnly })
    );
    expect(leave).toMatchObject({
      waitingForMe: 1,
      byNav: { approvals: 1, payments: 0 },
    });
  });
});

const idsAndDecide = (items: { id: string; decide: string }[]) =>
  items.map((item) => [item.id, item.decide]);

describe('ApprovalsService other rows by read permission', () => {
  const storeItem = waiting({
    kind: 'store_write_off',
    id: 'store-1',
    details: 'Lekki stock count: Tie: 1 missing',
    createdAt: '2026-10-16T10:00:00.000Z',
  });
  const withOthers = { ...page1, includeOthers: true };

  it('keeps a store write-off from a leave approver who reads adjustments but not the store', async () => {
    const service = serviceOver(provider(leaveItem, voidItem, storeItem));
    const grace = org('grace', {
      permissions: ['leave:approve', 'adjustment:read'],
    });
    const list = await service.list(grace, withOthers);
    expect(idsAndDecide(list.items)).toEqual([
      ['void-1', 'other'],
      ['leave-1', 'yes'],
    ]);
    expect(list.othersCount).toBe(1);
  });

  it('shows the store write-off as someone else’s once the viewer also reads the store', async () => {
    const service = serviceOver(provider(leaveItem, voidItem, storeItem));
    const grace = org('grace', {
      permissions: ['leave:approve', 'adjustment:read', 'store:read'],
    });
    const list = await service.list(grace, withOthers);
    expect(idsAndDecide(list.items)).toEqual([
      ['void-1', 'other'],
      ['leave-1', 'yes'],
      ['store-1', 'other'],
    ]);
    expect(list.othersCount).toBe(2);
  });

  it('shows the store write-off but not the void to a viewer who reads only the store', async () => {
    const service = serviceOver(provider(leaveItem, voidItem, storeItem));
    const grace = org('grace', {
      permissions: ['leave:approve', 'store:read'],
    });
    const list = await service.list(grace, withOthers);
    expect(idsAndDecide(list.items)).toEqual([
      ['leave-1', 'yes'],
      ['store-1', 'other'],
    ]);
    expect(list.othersCount).toBe(1);
  });

  it('still lets a super admin acting in the school decide both', async () => {
    const service = serviceOver(provider(voidItem, storeItem));
    const list = await service.list(
      org('root', { approve: false, acting: true }),
      page1
    );
    expect(idsAndDecide(list.items)).toEqual([
      ['void-1', 'yes'],
      ['store-1', 'yes'],
    ]);
  });
});

describe('ApprovalsService.summary', () => {
  it('counts what the viewer can decide, leaves their own out and rolls up to both nav items', async () => {
    const service = serviceOver(provider(voidItem, balanceItem, discountItem));
    const own = waiting({
      id: 'mine',
      createdById: 'grace',
      createdAt: '2026-10-14T08:00:00.000Z',
    });
    const withOwn = serviceOver(
      provider(voidItem, balanceItem, discountItem, own)
    );

    expect(await service.summary(org('grace'))).toMatchObject({
      waitingForMe: 3,
      byNav: { approvals: 3, payments: 3, store: 0 },
    });
    const summary = await withOwn.summary(org('grace'));
    expect(summary.waitingForMe).toBe(3);
    expect(summary.byNav).toEqual({ approvals: 3, payments: 3, store: 0 });
    expect(summary.preview.map((item) => item.id)).not.toContain('mine');
  });

  it('counts a store write-off on Store and the money kinds on Payments', async () => {
    const writeOff = waiting({
      kind: 'store_write_off',
      id: 'count-1',
      details: 'Lekki stock count: School tie: 1 missing',
      amountMinor: 116_667,
    });
    const own = waiting({
      kind: 'store_write_off',
      id: 'count-own',
      createdById: 'grace',
    });
    const summary = await serviceOver(
      provider(voidItem, writeOff, own)
    ).summary(org('grace'));
    expect(summary.waitingForMe).toBe(2);
    expect(summary.byNav).toEqual({ approvals: 2, payments: 1, store: 1 });
  });

  it('previews the first five, oldest first', async () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      waiting({
        id: `adj-${index}`,
        createdAt: `2026-10-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
      })
    );
    const summary = await serviceOver(provider(...many)).summary(org('grace'));
    expect(summary.waitingForMe).toBe(7);
    expect(summary.preview.map((item) => item.id)).toEqual([
      'adj-0',
      'adj-1',
      'adj-2',
      'adj-3',
      'adj-4',
    ]);
  });

  it('is empty for a member who cannot approve', async () => {
    const summary = await serviceOver(provider(voidItem)).summary(
      org('yemi', { approve: false })
    );
    expect(summary).toEqual({
      currency: 'NGN',
      waitingForMe: 0,
      byNav: { approvals: 0, payments: 0, store: 0 },
      preview: [],
    });
  });

  it('counts nothing when the only waiting request is the viewer’s own', async () => {
    const summary = await serviceOver(provider(balanceItem)).summary(
      org('chika')
    );
    expect(summary.waitingForMe).toBe(0);
    expect(summary.preview).toEqual([]);
  });
});
