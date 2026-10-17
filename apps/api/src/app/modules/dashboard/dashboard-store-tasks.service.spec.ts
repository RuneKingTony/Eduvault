import { toPermissionMap } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import type { StoreReadService } from '../store/store-read.service';
import { DashboardStoreTasksService } from './dashboard-store-tasks.service';

const ctxWith = (...permissions: Parameters<typeof toPermissionMap>[0]) =>
  ({ permissions: toPermissionMap(permissions) }) as unknown as OrgContext;

function setup(low: { count: number; names: string[] }) {
  const lowStockTask = vi.fn().mockResolvedValue(low);
  const service = new DashboardStoreTasksService({
    lowStockTask,
  } as unknown as StoreReadService);
  return { service, lowStockTask };
}

describe('DashboardStoreTasksService', () => {
  it('adds a lowStock task for a holder of store:receive', async () => {
    const { service } = setup({ count: 4, names: ['Tie', 'Pinafore'] });

    expect(await service.tasks(ctxWith('store:read', 'store:receive'))).toEqual(
      [{ kind: 'lowStock', count: 4, names: ['Tie', 'Pinafore'] }]
    );
  });

  it('adds no task without store:receive and does not look at the stock', async () => {
    const { service, lowStockTask } = setup({ count: 4, names: ['Tie'] });

    expect(await service.tasks(ctxWith('store:read'))).toEqual([]);
    expect(lowStockTask).not.toHaveBeenCalled();
  });

  it('adds no task when nothing is low', async () => {
    const { service } = setup({ count: 0, names: [] });

    expect(await service.tasks(ctxWith('store:receive'))).toEqual([]);
  });
});
