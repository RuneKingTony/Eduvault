import { redirect } from '@tanstack/react-router';

export function redirectTo(
  to: '/' | '/platform/schools' | '/platform/audit'
): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- redirects are thrown objects
  throw redirect({ to });
}
