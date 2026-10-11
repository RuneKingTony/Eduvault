export const PLACEHOLDER_EMAIL_DOMAIN = 'users.eduvault.invalid';

/** Users who sign in by username carry an address nobody can read. */
export const isPlaceholderEmail = (email: string): boolean =>
  email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
