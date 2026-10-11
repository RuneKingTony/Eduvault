export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:3000';

export const ADMIN_URL =
  (import.meta.env.VITE_ADMIN_URL as string | undefined) ??
  'http://localhost:4200';
