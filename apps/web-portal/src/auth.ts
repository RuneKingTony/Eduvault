import { createEduvaultAuthClient } from '@eduvault/auth-client';
import { API_URL } from './env';

export const authClient = createEduvaultAuthClient(API_URL);
