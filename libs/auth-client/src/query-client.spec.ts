import { ApiError } from '@eduvault/api-contract';
import {
  ME_KEY,
  ME_PERMISSIONS_KEY,
  createEduvaultQueryClient,
} from './me-gate';
import { QueryObserver } from '@tanstack/react-query';

const suspended = () =>
  new ApiError(403, {
    code: 'SchoolSuspended',
    message:
      'Greenfield is paused on Eduvault. Contact the school for details.',
  });

const forbidden = () =>
  new ApiError(403, { code: 'Forbidden', message: 'Missing permission x:y' });

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
    expect(spy).toHaveBeenCalledWith({ queryKey: ME_KEY, exact: true });
  });

  it('does the same for a mutation', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(suspended()) })
      .execute(undefined)
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledWith({ queryKey: ME_KEY, exact: true });
  });

  it('leaves other errors alone', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ['fees'],
        queryFn: () => Promise.reject(new Error('Network down')),
      })
      .catch(() => undefined);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('createEduvaultQueryClient and a refused access', () => {
  it('refetches the access after a 403 from a query', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ['students'],
        queryFn: () => Promise.reject(forbidden()),
      })
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledWith(
      { queryKey: ME_PERMISSIONS_KEY },
      { cancelRefetch: false }
    );
  });

  it('refetches the access after a 403 from a mutation', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(forbidden()) })
      .execute(undefined)
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledWith(
      { queryKey: ME_PERMISSIONS_KEY },
      { cancelRefetch: false }
    );
  });

  it('lets an access fetch that is already running finish', async () => {
    const client = createEduvaultQueryClient();
    const options = {
      queryKey: ME_PERMISSIONS_KEY,
      queryFn: () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve('access');
          }, 20);
        }),
    };
    client.setQueryData(ME_PERMISSIONS_KEY, 'previous school');
    const unsubscribe = new QueryObserver(client, options).subscribe(
      () => undefined
    );
    const running = client.query(options);

    await client
      .query({
        queryKey: ['students'],
        queryFn: () => Promise.reject(forbidden()),
      })
      .catch(() => undefined);

    await expect(running).resolves.toBe('access');
    unsubscribe();
  });

  it('leaves other errors alone', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ['students'],
        queryFn: () =>
          Promise.reject(
            new ApiError(404, { code: 'NotFound', message: 'Not found' })
          ),
      })
      .catch(() => undefined);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not loop when the access query itself is refused', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ME_PERMISSIONS_KEY,
        queryFn: () => Promise.reject(forbidden()),
      })
      .catch(() => undefined);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refetches who the person is when a school is suspended mid-session', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ['students'],
        queryFn: () =>
          Promise.reject(
            new ApiError(403, {
              code: 'SchoolSuspended',
              message: 'Greenfield is paused on Eduvault.',
            })
          ),
      })
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledWith({ queryKey: ME_KEY, exact: true });
    expect(spy).toHaveBeenCalledWith(
      { queryKey: ME_PERMISSIONS_KEY },
      { cancelRefetch: false }
    );
  });

  it('does the same when the suspension answers the access query itself', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ME_PERMISSIONS_KEY,
        queryFn: () =>
          Promise.reject(
            new ApiError(403, {
              code: 'SchoolSuspended',
              message: 'Greenfield is paused on Eduvault.',
            })
          ),
      })
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledExactlyOnceWith({
      queryKey: ME_KEY,
      exact: true,
    });
  });

  it('leaves an ordinary 403 without touching who the person is', async () => {
    const client = createEduvaultQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ['students'],
        queryFn: () => Promise.reject(forbidden()),
      })
      .catch(() => undefined);
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ME_KEY, exact: true });
  });
});
