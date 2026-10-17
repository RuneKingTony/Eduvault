import { naira } from '@eduvault/shared';
import { MASKED_COST, MASKED_LABEL } from './store-text';

export function MaskedMoney({ minor, show }: { minor: number; show: boolean }) {
  return show ? (
    naira(minor)
  ) : (
    <span role="img" aria-label={MASKED_LABEL}>
      {MASKED_COST}
    </span>
  );
}
