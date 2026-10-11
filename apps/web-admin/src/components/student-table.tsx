import { Fragment, type ReactNode } from 'react';
import { ChevronDownIcon, ChevronRightIcon, UserXIcon } from 'lucide-react';
import type { StudentRow, StudentTab } from '@eduvault/api-contract';
import { fmtDate } from '@eduvault/shared';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import type { GuardianAction, StudentRef } from './guardian-actions';
import { GuardianPanel } from './guardian-lines';
import { StatusBadges, StudentNameCell, nameOf } from './student-bits';

interface ColumnFlags {
  guardianRead: boolean;
  campusColumn: boolean;
  canArchive: boolean;
}

interface RowActions {
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onRecordLeaving: (id: string) => void;
  onAction: (action: GuardianAction) => void;
}

interface Column {
  id: string;
  header: string;
  cell: (row: StudentRow, actions: RowActions) => ReactNode;
}

const muted = (text: string) => (
  <span className="text-muted-foreground">{text}</span>
);

const currentClass = (row: StudentRow) =>
  row.currentPlacement?.className ?? muted('No class yet');

const latestClass = (row: StudentRow) => row.latestClassName ?? '—';

const campus: Column = {
  id: 'campus',
  header: 'Campus',
  cell: (row) => row.effectiveCampus.name,
};

const status: Column = {
  id: 'status',
  header: 'Status',
  cell: (row) => <StatusBadges row={row} />,
};

const paysFees: Column = {
  id: 'pays',
  header: 'Pays fees',
  cell: (row) =>
    row.payers === undefined || row.payers.length === 0
      ? '—'
      : row.payers.join(', '),
};

function notSeen(row: StudentRow): ReactNode {
  return (
    <div className="flex flex-col">
      {fmtDate(row.notSeenSince)}
      {row.notSeenBy === null ? null : (
        <span className="text-xs text-muted-foreground">
          Marked by {row.notSeenBy.name}
        </span>
      )}
    </div>
  );
}

function reason(row: StudentRow): ReactNode {
  const note = row.exit?.note ?? null;
  return (
    <div className="flex flex-col">
      {row.exit?.reason ?? '—'}
      {note === null ? null : (
        <span className="text-xs text-muted-foreground">{note}</span>
      )}
    </div>
  );
}

const recordLeaving: Column = {
  id: 'record-leaving',
  header: '',
  cell: (row, actions) =>
    row.dueLeft ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Record leaving for ${nameOf(row)}`}
        onClick={(event) => {
          event.stopPropagation();
          actions.onRecordLeaving(row.id);
        }}
      >
        <UserXIcon />
        Record leaving
      </Button>
    ) : null,
};

const TAB_COLUMNS: Record<StudentTab, (flags: ColumnFlags) => Column[]> = {
  active: (flags) => [
    { id: 'class', header: 'Class', cell: currentClass },
    ...(flags.campusColumn ? [campus] : []),
    ...(flags.guardianRead ? [paysFees] : []),
    status,
  ],
  new: (flags) => [
    { id: 'class', header: 'Class', cell: currentClass },
    ...(flags.campusColumn ? [campus] : []),
    {
      id: 'admitted',
      header: 'Admitted',
      cell: (row) => fmtDate(row.admittedOn),
    },
  ],
  inactive: (flags) => [
    { id: 'class', header: 'Class', cell: latestClass },
    ...(flags.campusColumn ? [campus] : []),
    { id: 'not-seen', header: 'Not seen since', cell: notSeen },
    { id: 'weeks', header: 'Weeks away', cell: (row) => row.weeksAway ?? '—' },
    status,
    ...(flags.canArchive ? [recordLeaving] : []),
  ],
  left: (flags) => [
    { id: 'class', header: 'Last class', cell: latestClass },
    ...(flags.campusColumn ? [campus] : []),
    { id: 'left-on', header: 'Left on', cell: (row) => fmtDate(row.exit?.on) },
    { id: 'reason', header: 'Reason', cell: reason },
  ],
  graduated: (flags) => [
    { id: 'class', header: 'Final class', cell: latestClass },
    ...(flags.campusColumn ? [campus] : []),
    {
      id: 'graduated-on',
      header: 'Graduated',
      cell: (row) => fmtDate(row.exit?.on),
    },
    {
      id: 'school-year',
      header: 'School year',
      cell: (row) => row.graduatedSessionName ?? '—',
    },
  ],
};

const columnsFor = (tab: StudentTab, flags: ColumnFlags): Column[] =>
  TAB_COLUMNS[tab](flags);

const refOf = (row: StudentRow): StudentRef => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  onRoll: row.life === 'active' || row.life === 'inactive',
});

function ExpandToggle({
  row,
  open,
  onToggle,
}: {
  row: StudentRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-expanded={open}
      aria-label={`Show guardians of ${nameOf(row)}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
    </Button>
  );
}

function StudentRowView({
  row,
  columns,
  open,
  flags,
  actions,
}: {
  row: StudentRow;
  columns: readonly Column[];
  open: boolean;
  flags: ColumnFlags;
  actions: RowActions;
}) {
  return (
    <Fragment>
      <TableRow
        className="cursor-pointer"
        onClick={() => {
          actions.onOpen(row.id);
        }}
      >
        {flags.guardianRead ? (
          <TableCell className="w-10">
            <ExpandToggle
              row={row}
              open={open}
              onToggle={() => {
                actions.onToggle(row.id);
              }}
            />
          </TableCell>
        ) : null}
        <TableCell>
          <StudentNameCell row={row} />
        </TableCell>
        {columns.map((column) => (
          <TableCell key={column.id}>{column.cell(row, actions)}</TableCell>
        ))}
      </TableRow>
      {open ? (
        <TableRow>
          <TableCell colSpan={columns.length + 2} className="p-0">
            <GuardianPanel student={refOf(row)} onAction={actions.onAction} />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}

export function StudentTable({
  rows,
  tab,
  flags,
  expanded,
  actions,
}: {
  rows: readonly StudentRow[];
  tab: StudentTab;
  flags: ColumnFlags;
  expanded: ReadonlySet<string>;
  actions: RowActions;
}) {
  const columns = columnsFor(tab, flags);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {flags.guardianRead ? (
            <TableHead className="w-10">
              <span className="sr-only">Show guardians</span>
            </TableHead>
          ) : null}
          <TableHead>Student</TableHead>
          {columns.map((column) => (
            <TableHead key={column.id}>{column.header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <StudentRowView
            key={row.id}
            row={row}
            columns={columns}
            open={expanded.has(row.id)}
            flags={flags}
            actions={actions}
          />
        ))}
      </TableBody>
    </Table>
  );
}
