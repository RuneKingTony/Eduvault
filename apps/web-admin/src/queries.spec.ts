import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { Api } from './api';
import { detail } from './test-members';
import {
  forgetMember,
  invalidateAfterRemoval,
  memberQueryOptions,
  membersQueryOptions,
} from './queries';

describe('member removal', () => {
  it('refreshes the list and roles but not the removed member’s own query', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const get = vi.fn().mockResolvedValue(detail());
    const api = { members: { list, get } } as unknown as Api;
    const queryClient = new QueryClient();
    const unsubscribe = [
      new QueryObserver(queryClient, membersQueryOptions(api, {})),
      new QueryObserver(queryClient, memberQueryOptions(api, 'm1')),
    ].map((observer) => observer.subscribe(() => undefined));
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
      expect(list).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(1);
    });

    await invalidateAfterRemoval(queryClient, 'm1');

    expect(list).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(1);

    for (const stop of unsubscribe) {
      stop();
    }
    forgetMember(queryClient, 'm1');
    expect(
      queryClient.getQueryData(memberQueryOptions(api, 'm1').queryKey)
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(membersQueryOptions(api, {}).queryKey)
    ).toBeDefined();
  });
});
