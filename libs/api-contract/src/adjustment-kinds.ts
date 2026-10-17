import { z } from 'zod';

export const ADJUSTMENT_KINDS = ['credit_note', 'write_off', 'refund'] as const;
export const adjustmentKindSchema = z.enum(ADJUSTMENT_KINDS);
export type AdjustmentKind = z.infer<typeof adjustmentKindSchema>;

export const ADJUSTMENT_KIND_LABELS = {
  credit_note: 'Reduce a fee',
  write_off: 'Cancel a balance',
  refund: 'Refund',
} as const satisfies Record<AdjustmentKind, string>;
