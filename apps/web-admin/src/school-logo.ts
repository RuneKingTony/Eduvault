import { API_URL } from './env';

/** The profile's `logoUrl` is relative to the API; `<img>` needs the whole address. */
export const logoSrc = (logoUrl: string | null): string | undefined =>
  logoUrl === null ? undefined : `${API_URL}${logoUrl}`;
