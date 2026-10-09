export function readStored(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string) {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // The preference applies for this visit; it just won't be remembered.
  }
}
