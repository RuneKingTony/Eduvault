import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UsersIcon } from 'lucide-react';
import type { FeeOptInRow, FeeOptIns } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { toggled } from '@eduvault/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  SearchInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { feeOptInsQueryOptions, invalidateFees } from '../../queries';
import { useDebounced } from '../../use-debounced';
import { optInsToast } from './fee-text';

interface CardProps {
  feeTypeId: string;
  feeTypeName: string;
  termId: string;
}

function useSetOptIns({ feeTypeId, feeTypeName, termId }: CardProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { studentIds: string[]; optedIn: boolean }) =>
      api.feeOptIns.set({ params: { feeTypeId }, body: { termId, ...input } }),
    onSuccess: async (saved, input) => {
      await invalidateFees(queryClient);
      toast.success(
        optInsToast(feeTypeName, input.optedIn, {
          selected: input.studentIds.length,
          changed: saved.changed,
        })
      );
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

function Status({ optedIn }: { optedIn: boolean }) {
  return optedIn ? (
    <Badge variant="success">Opted in</Badge>
  ) : (
    <span className="text-muted-foreground">Not opted in</span>
  );
}

function StudentRow({
  row,
  selectable,
  ticked,
  onToggle,
}: {
  row: FeeOptInRow;
  selectable: boolean;
  ticked: boolean;
  onToggle: (studentId: string) => void;
}) {
  return (
    <TableRow>
      {selectable ? (
        <TableCell>
          <Checkbox
            aria-label={`Select ${row.name}`}
            checked={ticked}
            onCheckedChange={() => {
              onToggle(row.studentId);
            }}
          />
        </TableCell>
      ) : null}
      <TableCell>
        <span className="font-medium">{row.name}</span>
        <span className="block text-xs text-muted-foreground">
          {row.admissionNumber}
        </span>
      </TableCell>
      <TableCell>{row.levelName}</TableCell>
      <TableCell>{row.campusName}</TableCell>
      <TableCell>
        <Status optedIn={row.optedIn} />
      </TableCell>
    </TableRow>
  );
}

function Students({
  rows,
  selectable,
  selected,
  onToggle,
  onToggleAll,
}: {
  rows: readonly FeeOptInRow[];
  selectable: boolean;
  selected: ReadonlySet<string>;
  onToggle: (studentId: string) => void;
  onToggleAll: () => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selectable ? (
            <TableHead className="w-8">
              <Checkbox
                aria-label="Select all"
                checked={selected.size === rows.length}
                onCheckedChange={onToggleAll}
              />
            </TableHead>
          ) : null}
          <TableHead>Student</TableHead>
          <TableHead>Level</TableHead>
          <TableHead>Campus</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <StudentRow
            key={row.studentId}
            row={row}
            selectable={selectable}
            ticked={selected.has(row.studentId)}
            onToggle={onToggle}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function Actions({
  count,
  pending,
  onSet,
}: {
  count: number;
  pending: boolean;
  onSet: (optedIn: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4">
      <span className="text-sm text-muted-foreground">{count} selected</span>
      <Button
        type="button"
        disabled={count === 0 || pending}
        onClick={() => {
          onSet(true);
        }}
      >
        Opt in
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={count === 0 || pending}
        onClick={() => {
          onSet(false);
        }}
      >
        Opt out
      </Button>
    </div>
  );
}

function NoStudents({ feeTypeName }: { feeTypeName: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UsersIcon />
        </EmptyMedia>
        <EmptyTitle>
          No student can take {feeTypeName} this school year
        </EmptyTitle>
        <EmptyDescription>
          Add an optional {feeTypeName} fee to offer it.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function useSelection(rows: readonly FeeOptInRow[]) {
  const [ids, setIds] = useState<string[]>([]);
  const shown = new Set(rows.map((row) => row.studentId));
  const selected = new Set(ids.filter((id) => shown.has(id)));
  return {
    selected,
    toggle: (studentId: string) => {
      setIds(toggled([...selected], studentId, !selected.has(studentId)));
    },
    toggleAll: () => {
      setIds(selected.size === rows.length ? [] : [...shown]);
    },
    clear: () => {
      setIds([]);
    },
  };
}

function Search({
  data,
  query,
  onQuery,
}: {
  data: FeeOptIns;
  query: string;
  onQuery: (query: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-4">
      <SearchInput
        aria-label="Search students"
        placeholder="Search name, admission no. or class"
        value={query}
        onChange={(event) => {
          onQuery(event.target.value);
        }}
      />
      {data.total > data.items.length ? (
        <p className="text-xs text-muted-foreground">
          Showing {data.items.length} of {data.total} students. Search to narrow
          the list.
        </p>
      ) : null}
      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No student matches that search
        </p>
      ) : null}
    </div>
  );
}

function Roster({
  data,
  query,
  searched,
  onQuery,
  feeType,
}: {
  data: FeeOptIns;
  query: string;
  searched: boolean;
  onQuery: (query: string) => void;
  feeType: CardProps;
}) {
  const canChange = useCan('feeLine', 'update');
  const save = useSetOptIns(feeType);
  const { selected, toggle, toggleAll, clear } = useSelection(data.items);
  if (data.total === 0 && !searched) {
    return <NoStudents feeTypeName={feeType.feeTypeName} />;
  }
  return (
    <>
      <Search data={data} query={query} onQuery={onQuery} />
      {canChange ? (
        <Actions
          count={selected.size}
          pending={save.isPending}
          onSet={(optedIn) => {
            save.mutate(
              { studentIds: [...selected], optedIn },
              { onSuccess: clear }
            );
          }}
        />
      ) : null}
      {data.items.length === 0 ? null : (
        <Students
          rows={data.items}
          selectable={canChange}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
        />
      )}
    </>
  );
}

export function FeeOptInsCard(feeType: CardProps) {
  const { feeTypeId, feeTypeName, termId } = feeType;
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const roster = useQuery(
    feeOptInsQueryOptions(useApi(), { feeTypeId, termId, q })
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Who takes {feeTypeName}</CardTitle>
        <CardDescription>
          Opted-in students are billed {feeTypeName} from the next round of
          charges. Opt-ins last the whole school year
          {roster.data === undefined ? '' : ` (${roster.data.schoolYearName})`}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-0">
        {roster.isPending ? (
          <div role="status" aria-label="Loading" className="px-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
        {roster.isError ? (
          <div className="px-4">
            <ErrorMessage error={roster.error} />
          </div>
        ) : null}
        {roster.data === undefined ? null : (
          <Roster
            data={roster.data}
            query={query}
            searched={q !== ''}
            onQuery={setQuery}
            feeType={feeType}
          />
        )}
      </CardContent>
    </Card>
  );
}
