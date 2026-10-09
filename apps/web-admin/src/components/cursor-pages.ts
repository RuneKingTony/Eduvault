import { useState } from 'react';

export function useCursorPages() {
  const [cursors, setCursors] = useState<string[]>([]);
  return {
    cursor: cursors.at(-1),
    page: cursors.length + 1,
    next: (cursor: string) => {
      setCursors((current) => [...current, cursor]);
    },
    previous: () => {
      setCursors((current) => current.slice(0, -1));
    },
    reset: () => {
      setCursors([]);
    },
  };
}
