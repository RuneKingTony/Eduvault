import { createEduvaultAuthClient } from '@eduvault/ui';
import { API_URL } from './env';

export const authClient = createEduvaultAuthClient(API_URL);
