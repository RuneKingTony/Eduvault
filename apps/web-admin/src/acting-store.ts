import { useSyncExternalStore } from 'react';
import {
  ACTING_ORG_HEADER,
  ACTING_REASON_HEADER,
  encodeActingReason,
} from '@eduvault/api-contract';

const STORAGE_KEY = 'eduvault.acting';

export interface SchoolRef {
  id: string;
  name: string;
}

export interface ActingState {
  organizationId: string;
  schoolName: string;
  reason: string | null;
}

const listeners = new Set<() => void>();

const readRaw = (): string | null => {
  try {
    return globalThis.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeRaw = (value: string | null) => {
  try {
    if (value === null) {
      globalThis.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      globalThis.sessionStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // Without storage acting cannot start, so there is nothing to keep.
  }
};

const parse = (raw: string | null): ActingState | null => {
  if (raw === null) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<ActingState>;
    return typeof value.organizationId === 'string' &&
      typeof value.schoolName === 'string'
      ? {
          organizationId: value.organizationId,
          schoolName: value.schoolName,
          reason: typeof value.reason === 'string' ? value.reason : null,
        }
      : null;
  } catch {
    return null;
  }
};

let cached: { raw: string | null; state: ActingState | null } = {
  raw: null,
  state: null,
};

/** The same object until the stored text changes, as useSyncExternalStore needs. */
export function getActing(): ActingState | null {
  const raw = readRaw();
  if (raw !== cached.raw) {
    cached = { raw, state: parse(raw) };
  }
  return cached.state;
}

const publish = (state: ActingState | null) => {
  writeRaw(state === null ? null : JSON.stringify(state));
  for (const listener of listeners) {
    listener();
  }
};

export const startActing = (organizationId: string, schoolName: string) => {
  publish({ organizationId, schoolName, reason: null });
};

export function allowWrites(reason: string) {
  const current = getActing();
  if (current !== null && reason.trim() !== '') {
    publish({ ...current, reason: reason.trim() });
  }
}

export function backToReadOnly() {
  const current = getActing();
  if (current !== null) {
    publish({ ...current, reason: null });
  }
}

export function leaveActing(): ActingState | null {
  const left = getActing();
  publish(null);
  return left;
}

export const clearActing = () => {
  if (getActing() !== null) {
    publish(null);
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useActing = (): ActingState | null =>
  useSyncExternalStore(subscribe, getActing, () => null);

export function actingHeaders(): Record<string, string> {
  const acting = getActing();
  if (acting === null) {
    return {};
  }
  return {
    [ACTING_ORG_HEADER]: acting.organizationId,
    ...(acting.reason === null
      ? {}
      : { [ACTING_REASON_HEADER]: encodeActingReason(acting.reason) }),
  };
}
