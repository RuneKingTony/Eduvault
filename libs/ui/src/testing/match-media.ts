import { vi } from 'vitest';

type Listener = () => void;

/** A controllable `window.matchMedia`: jsdom has none. */
export function stubMatchMedia(initial: Record<string, boolean>) {
  const matches = { ...initial };
  const listeners = new Map<string, Set<Listener>>();

  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches[query] ?? false;
    },
    media: query,
    addEventListener: (_type: string, listener: Listener) => {
      const set = listeners.get(query) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(query, set);
    },
    removeEventListener: (_type: string, listener: Listener) => {
      listeners.get(query)?.delete(listener);
    },
  }));

  return {
    set(query: string, value: boolean) {
      matches[query] = value;
      for (const listener of listeners.get(query) ?? []) {
        listener();
      }
    },
  };
}
