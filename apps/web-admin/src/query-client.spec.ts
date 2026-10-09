import { ApiError } from '@eduvault/api-contract';
import { createQueryClient } from './query-client';
import { ME_PERMISSIONS_KEY } from './queries';

const forbidden = () =>
  new ApiError(403, { code: 'Forbidden', message: 'Missing permission x:y' });

describe('query client', () => {
  it('refetches the access after a 403 from a query', async () => {
    const client = createQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ['students'],
        queryFn: () => Promise.reject(forbidden()),
      })
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledWith({ queryKey: ME_PERMISSIONS_KEY });
  });

  it('refetches the access after a 403 from a mutation', async () => {
    const client = createQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(forbidden()) })
      .execute(undefined)
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledWith({ queryKey: ME_PERMISSIONS_KEY });
  });

  it('leaves other errors alone', async () => {
    const client = createQueryClient();
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
    const client = createQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await client
      .query({
        queryKey: ME_PERMISSIONS_KEY,
        queryFn: () => Promise.reject(forbidden()),
      })
      .catch(() => undefined);
    expect(spy).not.toHaveBeenCalled();
  });
});
