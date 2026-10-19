import { useEffect, useState } from 'react';

export const SEARCH_DELAY_MS = 250;

export function useDebounced(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [value]);
  return settled;
}
