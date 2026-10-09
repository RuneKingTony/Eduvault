import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  Kbd,
  NavIcon,
  type NavIconName,
} from '@eduvault/ui';

export interface CommandEntry {
  id: string;
  label: string;
  hint: string;
  route: string;
  icon: NavIconName;
  keywords?: readonly string[];
}

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: readonly CommandEntry[];
  settings: readonly CommandEntry[];
  onSelect: (route: string) => void;
}

function matchesEveryWord(
  _value: string,
  search: string,
  keywords: string[] = []
): number {
  const haystack = keywords.join(' ').toLowerCase();
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word)) ? 1 : 0;
}

function EntryGroup({
  heading,
  entries,
  onSelect,
}: {
  heading: string;
  entries: readonly CommandEntry[];
  onSelect: (route: string) => void;
}) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <CommandGroup heading={heading}>
      {entries.map((entry) => (
        <CommandItem
          key={entry.id}
          value={`${heading}:${entry.id}`}
          keywords={[entry.label, entry.hint, ...(entry.keywords ?? [])]}
          onSelect={() => {
            onSelect(entry.route);
          }}
        >
          <NavIcon name={entry.icon} />
          <span>{entry.label}</span>
          <CommandShortcut>{entry.hint}</CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function Hints() {
  return (
    <div className="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd> move
      </span>
      <span className="flex items-center gap-1">
        <Kbd>↵</Kbd> open
      </span>
      <span className="flex items-center gap-1">
        <Kbd>Esc</Kbd> close
      </span>
    </div>
  );
}

export function CommandMenu({
  open,
  onOpenChange,
  pages,
  settings,
  onSelect,
}: CommandMenuProps) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command menu"
      description="Search pages and actions"
    >
      <Command loop filter={matchesEveryWord}>
        <CommandInput placeholder="Search pages and actions…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <EntryGroup heading="Pages" entries={pages} onSelect={onSelect} />
          <EntryGroup
            heading="Settings"
            entries={settings}
            onSelect={onSelect}
          />
        </CommandList>
        <Hints />
      </Command>
    </CommandDialog>
  );
}
