import { randomInt } from 'node:crypto';

// No 0, O, 1 or l: the owner reads this off a screen and types it in.
export const TEMP_CODE_ALPHABET =
  'ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const TEMPORARY_PASSWORD_LENGTH = 12;

export const generateTemporaryPassword = (): string =>
  Array.from(
    { length: TEMPORARY_PASSWORD_LENGTH },
    () => TEMP_CODE_ALPHABET[randomInt(TEMP_CODE_ALPHABET.length)]
  ).join('');
