import {
  INVOICE_KINDS,
  INVOICE_STATUSES,
  type InvoiceCounts,
} from '@eduvault/api-contract';
import { oneOf } from '@eduvault/shared';
import { NativeSelect, NativeSelectOption, SearchInput } from '@eduvault/ui';
import { KIND_LABELS, STATUS_LABELS } from '../billing/billing-text';
import type { InvoicesSearch } from '../../invoices-search';
import { useSearchText } from '../use-search-text';

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
  const { text, onTextChange } = useSearchText(search.q, (q) => {
    onSearchChange({ ...search, q, page: undefined });
  });
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      <SearchInput
        className="min-w-48 flex-1"
        aria-label="Search charges"
        placeholder="Search student or number"
        value={text}
        onChange={(event) => {
          onTextChange(event.target.value);
        }}
      />
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
