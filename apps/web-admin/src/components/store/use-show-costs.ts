import { useState } from 'react';
import { readStored, writeStored } from '@eduvault/ui';

export const SHOW_COSTS_KEY = 'eduvault.store.showCosts';

export function useShowCosts() {
  const [show, setShow] = useState(() => readStored(SHOW_COSTS_KEY) === 'true');
  return [
    show,
    (next: boolean) => {
      setShow(next);
      writeStored(SHOW_COSTS_KEY, String(next));
    },
  ] as const;
}
