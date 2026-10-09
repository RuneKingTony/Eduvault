import { ApiError } from '@eduvault/api-contract';
import { createEduvaultQueryClient } from '@eduvault/auth-client';
import { ME_PERMISSIONS_KEY } from './queries';

export const createQueryClient = () =>
  createEduvaultQueryClient((error, client, query) => {
    const isPermissionsQuery = query?.queryKey[0] === ME_PERMISSIONS_KEY[0];
    if (
      error instanceof ApiError &&
      error.status === 403 &&
      !isPermissionsQuery
    ) {
      void client.invalidateQueries({ queryKey: ME_PERMISSIONS_KEY });
    }
  });

export const queryClient = createQueryClient();
