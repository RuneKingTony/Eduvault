import { APPROVAL_PAGE_SIZE } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import {
  ApprovalRegistry,
  type ApprovalProvider,
  type WaitingApproval,
} from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
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
  options: { approve?: boolean; acting?: boolean } = {}
) =>
  ({
    organizationId: 'school-a',
    user: { id: userId },
    campusScope: 'all',
    permissions: toPermissionMap(
      options.approve === false ? ['payment:read'] : ['adjustment:approve']
    ),
    acting: options.acting === true ? { writes: false } : null,
  }) as unknown as OrgContext;

class FakeApprovals extends ApprovalsRepository {
  currency() {
    return Promise.resolve('NGN');
  }
}

const serviceOver = (...providers: ApprovalProvider[]) => {
  const registry = new ApprovalRegistry();
  for (const source of providers) {
    registry.add(source);
  }
  return new ApprovalsService(registry, new FakeApprovals());
};

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

    const list = await service.list(org('grace'), { page: 1 });

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
    const [first, second] = (await service.list(org('grace'), { page: 1 }))
      .items;
    expect(first).toMatchObject({
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
    const list = await service.list(org('chika'), { page: 1 });
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
      (await service.list(org('grace'), { page: 1 })).items.map(
        (item) => item.id
      )
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
    const first = await service.list(org('grace'), { page: 1 });
    const second = await service.list(org('grace'), { page: 2 });
    expect(first.items).toHaveLength(APPROVAL_PAGE_SIZE);
    expect(second.items.map((item) => item.id)).toEqual(['adj-10', 'adj-11']);
    expect(second.total).toBe(12);
  });

  it('shows nothing to a member who cannot approve', async () => {
    const service = serviceOver(provider(voidItem));
    expect(
      await service.list(org('yemi', { approve: false }), { page: 1 })
    ).toEqual({ currency: 'NGN', items: [], total: 0 });
  });

  it('shows the queue to a super admin acting in the school', async () => {
    const service = serviceOver(provider(voidItem));
    const list = await service.list(
      org('root', { approve: false, acting: true }),
      {
        page: 1,
      }
    );
    expect(list.items).toHaveLength(1);
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
      byNav: { approvals: 3, payments: 3 },
    });
    const summary = await withOwn.summary(org('grace'));
    expect(summary.waitingForMe).toBe(3);
    expect(summary.byNav).toEqual({ approvals: 3, payments: 3 });
    expect(summary.preview.map((item) => item.id)).not.toContain('mine');
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
      byNav: { approvals: 0, payments: 0 },
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
