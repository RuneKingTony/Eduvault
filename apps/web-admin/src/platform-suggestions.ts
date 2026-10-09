import {
  ADMISSION_PREFIX_MAX_LENGTH,
  SCHOOL_SLUG_MAX_LENGTH,
} from '@eduvault/api-contract';
import { initials, slugify } from '@eduvault/shared';

export const suggestSlug = (name: string): string =>
  slugify(name).slice(0, SCHOOL_SLUG_MAX_LENGTH).replace(/-$/, '');

const letters = (value: string) => value.replaceAll(/[^a-z]/gi, '');

export function suggestPrefix(name: string): string {
  const fromInitials = letters(
    name
      .split(/\s+/)
      .map((word) => initials(letters(word)))
      .join('')
  ).toUpperCase();
  const firstLetters = letters(name).toUpperCase();
  const prefix = fromInitials.length >= 2 ? fromInitials : firstLetters;
  return prefix.slice(0, ADMISSION_PREFIX_MAX_LENGTH);
}
