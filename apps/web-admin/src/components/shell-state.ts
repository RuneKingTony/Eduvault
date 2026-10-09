import { useState } from 'react';
import { readStored, writeStored } from '@eduvault/ui';

const RAIL_KEY = 'eduvault.sidebar';
const GROUPS_KEY = 'eduvault.nav-groups';

export function useRailOpen() {
  const [open, setOpen] = useState(() => readStored(RAIL_KEY) !== 'collapsed');
  return [
    open,
    (next: boolean) => {
      setOpen(next);
      writeStored(RAIL_KEY, next ? 'expanded' : 'collapsed');
    },
  ] as const;
}

function readCollapsedGroups(): string[] {
  try {
    const parsed: unknown = JSON.parse(readStored(GROUPS_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState(readCollapsedGroups);
  return {
    isCollapsed: (id: string) => collapsed.includes(id),
    toggle: (id: string) => {
      const next = collapsed.includes(id)
        ? collapsed.filter((other) => other !== id)
        : [...collapsed, id];
      setCollapsed(next);
      writeStored(GROUPS_KEY, JSON.stringify(next));
    },
  };
}
