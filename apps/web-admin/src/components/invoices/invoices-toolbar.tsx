import { SearchIcon } from 'lucide-react';
import {
  INVOICE_KINDS,
  INVOICE_STATUSES,
  type InvoiceCounts,
} from '@eduvault/api-contract';
import { oneOf } from '@eduvault/shared';
import { Input, NativeSelect, NativeSelectOption } from '@eduvault/ui';
import { KIND_LABELS, STATUS_LABELS } from '../billing/billing-text';
import type { InvoicesSearch } from '../../invoices-search';

const ANY = '';

type Change = (next: InvoicesSearch) => void;

function KindSelect({
  search,
  counts,
  onSearchChange,
}: {
  search: InvoicesSearch;
  counts: InvoiceCounts;
  onSearchChange: Change;
}) {
  return (
    <NativeSelect
      aria-label="Kind"
      value={search.kind ?? ANY}
      onChange={(event) => {
        onSearchChange({
          ...search,
          kind: oneOf(INVOICE_KINDS, event.target.value),
          page: undefined,
        });
      }}
    >
      <NativeSelectOption value={ANY}>All kinds</NativeSelectOption>
      {INVOICE_KINDS.map((kind) => (
        <NativeSelectOption key={kind} value={kind}>
          {KIND_LABELS[kind]} ({counts[kind]})
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function StatusSelect({
  search,
  onSearchChange,
}: {
  search: InvoicesSearch;
  onSearchChange: Change;
}) {
  return (
    <NativeSelect
      aria-label="Status"
      value={search.status ?? ANY}
      onChange={(event) => {
        onSearchChange({
          ...search,
          status: oneOf(INVOICE_STATUSES, event.target.value),
          page: undefined,
        });
      }}
    >
      <NativeSelectOption value={ANY}>Any status</NativeSelectOption>
      {INVOICE_STATUSES.map((status) => (
        <NativeSelectOption key={status} value={status}>
          {STATUS_LABELS[status]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

export function InvoicesToolbar({
  search,
  counts,
  shown,
  onSearchChange,
}: {
  search: InvoicesSearch;
  counts: InvoiceCounts;
  shown: number;
  onSearchChange: Change;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      <div className="relative min-w-48 flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          aria-label="Search charges"
          placeholder="Search student or number"
          value={search.q ?? ''}
          onChange={(event) => {
            onSearchChange({
              ...search,
              q: event.target.value === '' ? undefined : event.target.value,
              page: undefined,
            });
          }}
        />
      </div>
      <KindSelect
        search={search}
        counts={counts}
        onSearchChange={onSearchChange}
      />
      <StatusSelect search={search} onSearchChange={onSearchChange} />
      <span className="ml-auto text-sm text-muted-foreground">
        {shown} shown
      </span>
    </div>
  );
}
