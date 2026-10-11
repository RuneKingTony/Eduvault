/** A `logoUrl` is relative to the API; `<img>` needs the whole address. */
export const logoSrc = (
  apiUrl: string,
  logoUrl: string | null
): string | undefined => (logoUrl === null ? undefined : `${apiUrl}${logoUrl}`);
