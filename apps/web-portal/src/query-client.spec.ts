import { ME_KEY } from '@eduvault/auth-client';
import { ApiError } from '@eduvault/api-contract';
import { createQueryClient } from './query-client';

const suspended = () =>
  new ApiError(403, {
    code: 'SchoolSuspended',
    message:
      'Greenfield is paused on Eduvault. Contact the school for details.',
  });

describe('portal query client', () => {
  it('refetches who the person is when a query answers SchoolSuspended', async () => {
    const client = createQueryClient();
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
    const client = createQueryClient();
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
    const client = createQueryClient();
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
});
