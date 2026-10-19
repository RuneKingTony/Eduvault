import { createEduvaultQueryClient } from '@eduvault/auth-client';

const createQueryClient = () => createEduvaultQueryClient();

export const queryClient = createQueryClient();
