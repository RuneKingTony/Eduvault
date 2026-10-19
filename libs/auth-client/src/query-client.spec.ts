import { ApiError } from '@eduvault/api-contract';
import { ME_KEY, createEduvaultQueryClient } from './me-gate';

const suspended = () =>
  new ApiError(403, {
    code: 'SchoolSuspended',
    message:
      'Greenfield is paused on Eduvault. Contact the school for details.',
  });

describe('createEduvaultQueryClient', () => {
  it('refetches who the person is when a query answers SchoolSuspended', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ['students'],
        queryFn: () => Promise.reject(suspended()),
      })
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledExactlyOnceWith({
      queryKey: ME_KEY,
      exact: true,
    });
  });

  it('does the same for a mutation', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(suspended()) })
      .execute(undefined)
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledExactlyOnceWith({
      queryKey: ME_KEY,
      exact: true,
    });
  });

  it('leaves other errors alone', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ['students'],
        queryFn: () =>
          Promise.reject(
            new ApiError(403, { code: 'Forbidden', message: 'No' })
          ),
      })
      .catch(() => undefined);
    await client
      .query({
        queryKey: ['fees'],
        queryFn: () => Promise.reject(new Error('Network down')),
      })
      .catch(() => undefined);
    expect(spy).not.toHaveBeenCalled();
  });

  it('hands the failed query and the client to an app’s own error hook', async () => {
    const onError = vi.fn();
    const client = createEduvaultQueryClient(onError);
    const error = new Error('Network down');
    await client
      .query({ queryKey: ['fees'], queryFn: () => Promise.reject(error) })
      .catch(() => undefined);
    expect(onError).toHaveBeenCalledOnce();
    const [receivedError, receivedClient, query] = onError.mock.calls[0] as [
      Error,
      unknown,
      { queryKey: unknown },
    ];
    expect(receivedError).toBe(error);
    expect(receivedClient).toBe(client);
    expect(query.queryKey).toEqual(['fees']);
  });
});
