import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InfoIcon, LayersIcon, PlusIcon, SchoolIcon } from 'lucide-react';
import { countOf } from '@eduvault/shared';
import type { ClassStatus, ClassSummary } from '@eduvault/api-contract';
import { Can, UserAvatar, usePermissions } from '@eduvault/auth-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  NativeSelect,
  NativeSelectOption,
  NumberedPager,
  PageSkeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { teachersTooltip } from '../components/class-text';
import { NewClassSheet } from '../components/new-class-sheet';
import { NoCurrentTermCallout } from '../components/no-current-term-callout';
import { classesQueryOptions, currentTermQueryOptions } from '../queries';

const PAGE_SIZE = 10;

const INFO_ALL =
  'A level is a year group, like JSS 1. Every campus uses the same levels. A class belongs to one campus and carries over each school year. Classes are archived, never deleted.';
const INFO_SCOPED =
  'Class scope: you see only the classes you teach or are class teacher of.';

export function describeClasses(
  active: readonly ClassSummary[],
  scoped: boolean,
  year: string | null
): string | null {
  if (scoped) {
    return active.length === 0
      ? null
      : `Classes you teach: ${active.map((row) => row.displayName).join(', ')}`;
  }
  const count = countOf(active.length, 'class', 'classes');
  return year === null ? count : `${count} in ${year}`;
}

interface LevelGroup {
  id: string;
  name: string;
  classes: ClassSummary[];
}

function groupByLevel(classes: readonly ClassSummary[]): LevelGroup[] {
  const groups = new Map<string, LevelGroup>();
  for (const row of classes) {
    const group = groups.get(row.level.id) ?? {
      id: row.level.id,
      name: row.level.name,
      classes: [],
    };
    group.classes.push(row);
    groups.set(row.level.id, group);
  }
  return [...groups.values()];
}

function TeacherCell({
  teachers,
}: {
  teachers: ClassSummary['classTeachers'];
}) {
  const [only] = teachers;
  if (only === undefined) {
    return <span className="text-muted-foreground">Not assigned</span>;
  }
  if (teachers.length === 1) {
    return (
      <span className="flex items-center gap-2">
        <UserAvatar name={only.name} className="size-6" />
        {only.name}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-default underline decoration-dotted"
        >
          {teachers.length} teachers
        </button>
      </TooltipTrigger>
      <TooltipContent>{teachersTooltip(teachers)}</TooltipContent>
    </Tooltip>
  );
}

function ClassRow({
  row,
  hasTerm,
  onOpen,
}: {
  row: ClassSummary;
  hasTerm: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => {
        onOpen(row.id);
      }}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <SchoolIcon className="size-4 text-muted-foreground" />
          <div className="flex flex-col">
            <button
              type="button"
              className="text-left font-medium hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(row.id);
              }}
            >
              {row.displayName}
            </button>
            <span className="text-xs text-muted-foreground">
              {row.campus.name}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <TeacherCell teachers={row.classTeachers} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {hasTerm ? row.studentCount : '—'}
      </TableCell>
      <TableCell>
        <Badge variant={row.retiredAt === null ? 'success' : 'secondary'}>
          {row.retiredAt === null ? 'Active' : 'Archived'}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function LevelCard({
  group,
  hasTerm,
  onOpen,
}: {
  group: LevelGroup;
  hasTerm: boolean;
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const shown = group.classes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayersIcon className="size-4 text-primary" />
          {group.name}
        </CardTitle>
        <CardDescription>
          {countOf(group.classes.length, 'class', 'classes')}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Class teacher</TableHead>
              <TableHead className="text-right">Students</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row) => (
              <ClassRow
                key={row.id}
                row={row}
                hasTerm={hasTerm}
                onOpen={onOpen}
              />
            ))}
          </TableBody>
        </Table>
        {group.classes.length > PAGE_SIZE ? (
          <NumberedPager
            page={page}
            total={group.classes.length}
            pageSize={PAGE_SIZE}
            onPage={setPage}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ClassesHeader({
  description,
  scoped,
  onNew,
}: {
  description: string | null;
  scoped: boolean;
  onNew: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          Classes
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About classes"
                className="text-muted-foreground"
              >
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{scoped ? INFO_SCOPED : INFO_ALL}</TooltipContent>
          </Tooltip>
        </h1>
        {description === null ? null : (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <Can permission="class:create">
        <Button type="button" onClick={onNew}>
          <PlusIcon />
          New class
        </Button>
      </Can>
    </header>
  );
}

function StatusFilter({
  status,
  onChange,
}: {
  status: ClassStatus;
  onChange: (status: ClassStatus) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="class-status" className="text-muted-foreground">
        Show
      </label>
      <NativeSelect
        id="class-status"
        value={status}
        onChange={(event) => {
          onChange(event.target.value as ClassStatus);
        }}
      >
        <NativeSelectOption value="active">Active classes</NativeSelectOption>
        <NativeSelectOption value="archived">Archived</NativeSelectOption>
        <NativeSelectOption value="all">All</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}

function NothingInScope() {
  return (
    <Card>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SchoolIcon />
            </EmptyMedia>
            <EmptyTitle>No classes in your scope</EmptyTitle>
            <EmptyDescription>
              Classes you can see show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

function useClassesData(status: ClassStatus) {
  const api = useApi();
  const shown = useQuery(classesQueryOptions(api, status));
  const active = useQuery(classesQueryOptions(api, 'active'));
  const current = useQuery(currentTermQueryOptions(api));
  const failure = shown.error ?? active.error ?? current.error;
  if (
    failure !== null ||
    shown.data === undefined ||
    active.data === undefined ||
    current.data === undefined
  ) {
    return { failure, data: undefined };
  }
  return {
    failure,
    data: { shown: shown.data, active: active.data, current: current.data },
  };
}

export function ClassesPage({
  status,
  onStatusChange,
  onOpenClass,
}: {
  status: ClassStatus;
  onStatusChange: (status: ClassStatus) => void;
  onOpenClass: (id: string) => void;
}) {
  const { classScope } = usePermissions();
  const scoped = classScope !== 'all';
  const { failure, data } = useClassesData(status);
  const [newOpen, setNewOpen] = useState(false);
  if (failure !== null) {
    return <ErrorMessage error={failure} />;
  }
  if (data === undefined) {
    return <PageSkeleton rows={2} />;
  }
  const hasTerm = data.current.term !== null;
  const groups = groupByLevel(data.shown);
  return (
    <section className="flex flex-col gap-4">
      <ClassesHeader
        description={describeClasses(
          data.active,
          scoped,
          data.current.schoolYear?.name ?? null
        )}
        scoped={scoped}
        onNew={() => {
          setNewOpen(true);
        }}
      />
      {hasTerm ? null : <NoCurrentTermCallout />}
      {scoped ? null : (
        <StatusFilter status={status} onChange={onStatusChange} />
      )}
      {groups.length === 0 ? (
        <NothingInScope />
      ) : (
        groups.map((group) => (
          <LevelCard
            key={group.id}
            group={group}
            hasTerm={hasTerm}
            onOpen={onOpenClass}
          />
        ))
      )}
      <NewClassSheet open={newOpen} onOpenChange={setNewOpen} />
    </section>
  );
}
