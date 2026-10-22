import { useRef, useState } from 'react';

export interface ConfirmStep<T> {
  target: T | null;
  ask: (next: T) => void;
  cancel: () => void;
  confirm: () => void;
}

/** Holds what a sheet is about to send until the person confirms it; `run` sends it and calls `settled` when the request ends. */
export function useConfirmStep<T>(
  run: (target: T, settled: () => void) => void
): ConfirmStep<T> {
  const [target, setTarget] = useState<T | null>(null);
  const sending = useRef(false);
  return {
    target,
    ask: setTarget,
    cancel: () => {
      setTarget(null);
    },
    confirm: () => {
      if (target === null || sending.current) {
        return;
      }
      sending.current = true;
      run(target, () => {
        sending.current = false;
        setTarget(null);
      });
    },
  };
}
