import {
  PAYMENT_PROOF,
  PAYMENT_PROOF_DENIED_MESSAGE,
  PAYMENT_PROOF_INVALID_MESSAGE,
  PAYMENT_PROOF_LOCKED_MESSAGE,
  PAYMENT_PROOF_SIZE_MESSAGE,
  PAYMENT_PROOF_TYPE_MESSAGE,
  WALLET_PROOF,
  WALLET_PROOF_DENIED_MESSAGE,
  WALLET_PROOF_LOCKED_MESSAGE,
  WALLET_REFUND_PROOF_DENIED_MESSAGE,
  WALLET_REFUND_PROOF_LOCKED_MESSAGE,
} from '@eduvault/api-contract';
import { describe, expect, it } from 'vitest';
import { FILE_KIND_RULES } from './file-kinds';

describe('FILE_KIND_RULES proof kinds', () => {
  it('pins payment_proof', () => {
    expect(FILE_KIND_RULES.payment_proof).toEqual({
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
    });
  });

  it('pins wallet_proof', () => {
    expect(FILE_KIND_RULES.wallet_proof).toEqual({
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
    });
  });

  it('pins wallet_refund_request', () => {
    expect(FILE_KIND_RULES.wallet_refund_request).toEqual({
      maxBytes: WALLET_PROOF.maxBytes,
      types: WALLET_PROOF.types,
      write: ['wallet:requestRefund'],
      read: 'wallet:read',
      campusScoped: true,
      locked: WALLET_REFUND_PROOF_LOCKED_MESSAGE,
      denied: WALLET_REFUND_PROOF_DENIED_MESSAGE,
      tooLarge: PAYMENT_PROOF_SIZE_MESSAGE,
      wrongType: PAYMENT_PROOF_TYPE_MESSAGE,
      unusable: PAYMENT_PROOF_INVALID_MESSAGE,
    });
  });
});
