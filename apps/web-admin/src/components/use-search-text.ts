import { useEffect, useRef, useState } from 'react';
import { SEARCH_DELAY_MS } from '../use-debounced';

const normalised = (text: string): string | undefined => {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * The text of a search box whose value lives in the URL. `apply` runs once,
 * `SEARCH_DELAY_MS` after the last keystroke, with the trimmed text or
 * undefined when it is empty; a change to `q` that this box did not send
 * (back button, a cleared filter) replaces what is shown.
 */
export function useSearchText(
  q: string | undefined,
  apply: (q: string | undefined) => void
) {
  const [text, setText] = useState(q ?? '');
  const [seen, setSeen] = useState(q);
  const [sent, setSent] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (q !== seen) {
    setSeen(q);
    if (q !== sent) {
      setText(q ?? '');
      setSent(q);
    }
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    []
  );

  const onTextChange = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const value = normalised(next);
      setSent(value);
      apply(value);
    }, SEARCH_DELAY_MS);
  };

  return { text, onTextChange };
}
