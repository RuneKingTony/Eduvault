import { createEduvaultQueryClient } from '@eduvault/auth-client';

export const createQueryClient = () => createEduvaultQueryClient();

export const queryClient = createQueryClient();
