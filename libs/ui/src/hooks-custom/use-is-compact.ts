import { useSyncExternalStore } from 'react';

const COMPACT_QUERY = '(max-width: 820px)';

function subscribe(onChange: () => void) {
  const query = globalThis.matchMedia(COMPACT_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function getSnapshot() {
  return globalThis.matchMedia(COMPACT_QUERY).matches;
}

/** True at 820px and narrower, where the shells swap to their phone layout. */
export function useIsCompact() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
