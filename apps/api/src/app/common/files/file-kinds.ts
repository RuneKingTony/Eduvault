import {
  GUARDIAN_PHOTO_INVALID_MESSAGE,
  GUARDIAN_PHOTO_SIZE_MESSAGE,
  GUARDIAN_PHOTO_TYPE_MESSAGE,
  PAYMENT_PROOF,
  PAYMENT_PROOF_DENIED_MESSAGE,
  PAYMENT_PROOF_INVALID_MESSAGE,
  PAYMENT_PROOF_LOCKED_MESSAGE,
  PAYMENT_PROOF_SIZE_MESSAGE,
  PAYMENT_PROOF_TYPE_MESSAGE,
  WALLET_PROOF,
  WALLET_PROOF_DENIED_MESSAGE,
  WALLET_PROOF_LOCKED_MESSAGE,
  type FileKind,
} from '@eduvault/api-contract';
import type { Permission } from '@eduvault/policy';
import type { SniffedType } from './sniff-file';

export interface FileKindRule {
  maxBytes: number;
  types: readonly SniffedType[];
  write: readonly Permission[];
  /** Who may read an attached file; undefined means any member of the school. */
  read: Permission | undefined;
  campusScoped: boolean;
  /** Why an attached file cannot be removed; undefined means it can. */
  locked: string | undefined;
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
    write: ['schoolAccount:update'],
    read: undefined,
    campusScoped: false,
    locked: undefined,
    denied: 'You need permission to change school settings.',
    tooLarge: 'That logo is over 1 MB. Please choose a smaller one.',
    wrongType: 'Choose a PNG, JPG or WebP logo.',
    unusable: 'That logo can’t be used. Please upload it again.',
  },
  guardian_photo: {
    maxBytes: MEGABYTE,
    types: ['image/png', 'image/jpeg', 'image/webp'],
    write: ['guardian:create', 'guardian:update'],
    read: 'guardian:read',
    campusScoped: false,
    locked: undefined,
    denied: 'You need permission to add or change guardians.',
    tooLarge: GUARDIAN_PHOTO_SIZE_MESSAGE,
    wrongType: GUARDIAN_PHOTO_TYPE_MESSAGE,
    unusable: GUARDIAN_PHOTO_INVALID_MESSAGE,
  },
  payment_proof: {
    maxBytes: PAYMENT_PROOF.maxBytes,
    types: PAYMENT_PROOF.types,
    write: ['payment:record', 'store:issue'],
    read: 'payment:read',
    campusScoped: true,
    locked: PAYMENT_PROOF_LOCKED_MESSAGE,
    denied: PAYMENT_PROOF_DENIED_MESSAGE,
    tooLarge: PAYMENT_PROOF_SIZE_MESSAGE,
    wrongType: PAYMENT_PROOF_TYPE_MESSAGE,
    unusable: PAYMENT_PROOF_INVALID_MESSAGE,
  },
  wallet_proof: {
    maxBytes: WALLET_PROOF.maxBytes,
    types: WALLET_PROOF.types,
    write: ['wallet:topUp'],
    read: 'wallet:read',
    campusScoped: true,
    locked: WALLET_PROOF_LOCKED_MESSAGE,
    denied: WALLET_PROOF_DENIED_MESSAGE,
    tooLarge: PAYMENT_PROOF_SIZE_MESSAGE,
    wrongType: PAYMENT_PROOF_TYPE_MESSAGE,
    unusable: PAYMENT_PROOF_INVALID_MESSAGE,
  },
};

/** One byte above the largest cap: bounds what any member can make the server buffer before the permission check. */
export const UPLOAD_PARSER_LIMIT_BYTES =
  Math.max(...Object.values(FILE_KIND_RULES).map((rule) => rule.maxBytes)) + 1;
