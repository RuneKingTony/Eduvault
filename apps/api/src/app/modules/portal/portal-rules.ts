import type { PortalKind } from '@eduvault/api-contract';
import { isPlaceholderEmail } from '@eduvault/shared';

export const portalKindOf = (hasStudentRow: boolean): PortalKind =>
  hasStudentRow ? 'student' : 'guardian';

export const realEmail = (email: string): string | null =>
  isPlaceholderEmail(email) ? null : email;

export const firstNameOf = (
  name: string,
  studentFirstName: string | null
): string => studentFirstName ?? name.trim().split(' ')[0] ?? name;
