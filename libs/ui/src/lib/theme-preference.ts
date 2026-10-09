import { useSyncExternalStore } from 'react';
import { readStored, writeStored } from './storage';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
}

const STORAGE_KEY = 'eduvault-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const listeners = new Set<() => void>();
let state: ThemeState | null = null;
let watching = false;

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredChoice(): ThemeChoice {
  const stored = readStored(STORAGE_KEY);
  return isThemeChoice(stored) ? stored : 'system';
}

function systemPrefersDark(): boolean {
  return globalThis.matchMedia(DARK_QUERY).matches;
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') {
    return systemPrefersDark() ? 'dark' : 'light';
  }
  return choice;
}

function commit(choice: ThemeChoice) {
  const resolved = resolve(choice);
  state = { choice, resolved };
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  for (const listener of listeners) {
    listener();
  }
}

function getState(): ThemeState {
  if (state === null) {
    const choice = readStoredChoice();
    state = { choice, resolved: resolve(choice) };
  }
  return state;
}

/** Applies the stored choice and follows the device while the choice is system. Call before the first render. */
export function initTheme() {
  commit(getState().choice);
  if (watching) {
    return;
  }
  watching = true;
  globalThis.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (getState().choice === 'system') {
      commit('system');
    }
  });
}

export function setThemeChoice(choice: ThemeChoice) {
  writeStored(STORAGE_KEY, choice);
  commit(choice);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useThemeChoice() {
  const current = useSyncExternalStore(subscribe, getState);
  return { ...current, setChoice: setThemeChoice };
}
