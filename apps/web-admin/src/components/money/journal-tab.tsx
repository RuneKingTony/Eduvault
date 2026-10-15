import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import {
  JOURNAL_KINDS,
  JOURNAL_RANGE_MESSAGE,
  type JournalEntry,
  type JournalKind,
} from '@eduvault/api-contract';
import { fmtDate, money } from '@eduvault/shared';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  FieldError,
  NativeSelectOption,
  SelectField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextField,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { journalQueryOptions } from '../../queries';
import {
  JOURNAL_KIND_LABELS,
  SCHOOL_WIDE_LABEL,
  entryCaption,
} from './money-text';
import { FinancePager, QueryState } from './query-state';

const ALL_KINDS = 'all';

interface Filters {
  from: string;
  to: string;
  kind: string;
}

const rangeIsBackwards = ({ from, to }: Filters): boolean =>
  from !== '' && to !== '' && from > to;

function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  return (
    <div className="grid gap-3 px-4 sm:grid-cols-3">
      <TextField
        label="From"
        type="date"
        value={filters.from}
        onChange={(event) => {
          onChange({ ...filters, from: event.target.value });
        }}
      />
      <TextField
        label="To"
        type="date"
        value={filters.to}
        onChange={(event) => {
          onChange({ ...filters, to: event.target.value });
        }}
      />
      <SelectField
        label="Kind"
        value={filters.kind}
        onChange={(event) => {
          onChange({ ...filters, kind: event.target.value });
        }}
      >
        <NativeSelectOption value={ALL_KINDS}>All kinds</NativeSelectOption>
        {JOURNAL_KINDS.map((kind) => (
          <NativeSelectOption key={kind} value={kind}>
            {JOURNAL_KIND_LABELS[kind]}
          </NativeSelectOption>
        ))}
      </SelectField>
    </div>
  );
}

function Lines({ entry, currency }: { entry: JournalEntry; currency: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>Student</TableHead>
          <TableHead>Campus</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="text-right">Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entry.lines.map((line) => (
          <TableRow
            key={`${line.accountCode}-${line.debitMinor}-${line.creditMinor}`}
          >
            <TableCell>{`${line.accountCode} ${line.accountName}`}</TableCell>
            <TableCell>{line.studentName ?? '—'}</TableCell>
            <TableCell>{line.campusName ?? SCHOOL_WIDE_LABEL}</TableCell>
            <TableCell className="text-right tabular-nums">
              {line.debitMinor === 0 ? '—' : money(line.debitMinor, currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {line.creditMinor === 0 ? '—' : money(line.creditMinor, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EntryRow({
  entry,
  currency,
}: {
  entry: JournalEntry;
  currency: string;
}) {
  return (
    <li className="border-b last:border-b-0">
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90"
          />
          <span className="w-28 shrink-0 text-sm text-muted-foreground">
            {fmtDate(entry.effectiveOn)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">
              {JOURNAL_KIND_LABELS[entry.kind]}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {entryCaption(entry.reference, entry.memo)}
            </span>
          </span>
          <span className="font-medium tabular-nums">
            {money(entry.totalMinor, currency)}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-3">
          <Lines entry={entry} currency={currency} />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function EntriesBody({
  journal,
  page,
  onPage,
}: {
  journal: ReturnType<typeof useJournal>;
  page: number;
  onPage: (page: number) => void;
}) {
  return (
    <QueryState query={journal}>
      {({ items, total, currency }) =>
        items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No entries yet</EmptyTitle>
              <EmptyDescription>
                Charges, payments and opening balances show up here once they
                are posted.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ul className="border-t">
              {items.map((entry) => (
                <EntryRow
                  key={entry.entryId}
                  entry={entry}
                  currency={currency}
                />
              ))}
            </ul>
            <FinancePager page={page} total={total} onPage={onPage} />
          </>
        )
      }
    </QueryState>
  );
}

function useJournal(filters: Filters, page: number) {
  return useQuery({
    ...journalQueryOptions(useApi(), {
      from: filters.from === '' ? undefined : filters.from,
      to: filters.to === '' ? undefined : filters.to,
      kind:
        filters.kind === ALL_KINDS ? undefined : (filters.kind as JournalKind),
      page,
    }),
    enabled: !rangeIsBackwards(filters),
  });
}

function Entries({
  filters,
  page,
  onPage,
}: {
  filters: Filters;
  page: number;
  onPage: (page: number) => void;
}) {
  const journal = useJournal(filters, page);
  if (rangeIsBackwards(filters)) {
    return (
      <div className="px-4">
        <FieldError message={JOURNAL_RANGE_MESSAGE} />
      </div>
    );
  }
  return <EntriesBody journal={journal} page={page} onPage={onPage} />;
}

export function JournalTab() {
  const [filters, setFilters] = useState<Filters>({
    from: '',
    to: '',
    kind: ALL_KINDS,
  });
  const [page, setPage] = useState(1);
  return (
    <div className="flex flex-col gap-4 py-4">
      <FilterBar
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
      />
      <Entries filters={filters} page={page} onPage={setPage} />
    </div>
  );
}
