import type { FileKind } from '@eduvault/api-contract';
import type { Permission } from '@eduvault/policy';
import type { ImageType } from './sniff-image';

export interface FileKindRule {
  maxBytes: number;
  types: readonly ImageType[];
  write: Permission;
  /** Who may read an attached file; undefined means any member of the school. */
  read: Permission | undefined;
  denied: string;
  tooLarge: string;
  wrongType: string;
  unusable: string;
}

const MEGABYTE = 1_048_576;

export const FILE_KIND_RULES: Record<FileKind, FileKindRule> = {
  school_logo: {
    maxBytes: MEGABYTE,
    types: ['image/png', 'image/jpeg', 'image/webp'],
    write: 'schoolAccount:update',
    read: undefined,
    denied: 'You need permission to change school settings.',
    tooLarge: 'That logo is over 1 MB. Please choose a smaller one.',
    wrongType: 'Choose a PNG, JPG or WebP logo.',
    unusable: 'That logo can’t be used. Please upload it again.',
  },
};

/** One byte above the largest cap: bounds what any member can make the server buffer before the permission check. */
export const UPLOAD_PARSER_LIMIT_BYTES =
  Math.max(...Object.values(FILE_KIND_RULES).map((rule) => rule.maxBytes)) + 1;
