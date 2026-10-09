export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:3000';

/** True only in the dev server; the production build folds it to `false`. */
export const isDev = import.meta.env.DEV;
