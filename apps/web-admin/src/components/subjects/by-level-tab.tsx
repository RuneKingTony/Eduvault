import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BookMarkedIcon, PencilIcon } from 'lucide-react';
import { Can, useCan } from '@eduvault/auth-client';
import type { LevelSubject } from '@eduvault/api-contract';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  PageSkeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  classLevelsQueryOptions,
  electivesQueryOptions,
  levelSubjectsQueryOptions,
} from '../../queries';
import {
  ElectiveTakersSheet,
  type ElectiveTarget,
} from './elective-takers-sheet';
import { ElectivesCard } from './electives-card';
import { LevelSubjectsSheet, type EditableLevel } from './level-subjects-sheet';

interface LevelGroup {
  id: string;
  name: string;
  rows: LevelSubject[];
}

export function groupByLevel(
  levels: readonly { id: string; name: string }[],
  rows: readonly LevelSubject[]
): LevelGroup[] {
  return levels.map((level) => ({
    id: level.id,
    name: level.name,
    rows: rows
      .filter((row) => row.classLevelId === level.id)
      .toSorted((a, b) => a.sequence - b.sequence),
  }));
}

function LevelCard({
  group,
  onEdit,
}: {
  group: LevelGroup;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {group.name}
          <Badge variant="secondary">{group.rows.length}</Badge>
        </CardTitle>
        <Can permission="subject:update">
          <CardAction>
            <Button type="button" variant="ghost" size="xs" onClick={onEdit}>
              <PencilIcon />
              Edit subjects
            </Button>
          </CardAction>
        </Can>
      </CardHeader>
      <CardContent className="px-0">
        {group.rows.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">No subjects yet</p>
        ) : (
          <LevelTable group={group} />
        )}
      </CardContent>
    </Card>
  );
}

function LevelTable({ group }: { group: LevelGroup }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 text-right">#</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Kind</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {group.rows.map((row) => (
          <TableRow key={row.subjectId}>
            <TableCell className="text-right">{row.sequence}</TableCell>
            <TableCell className="font-medium">{row.subjectName}</TableCell>
            <TableCell>
              <Badge variant={row.kind === 'core' ? 'secondary' : 'default'}>
                {row.kind === 'core' ? 'Core' : 'Elective'}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NoLevels() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookMarkedIcon />
        </EmptyMedia>
        <EmptyTitle>No class levels yet</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

export function ByLevelTab() {
  const api = useApi();
  const levels = useQuery(classLevelsQueryOptions(api));
  const rows = useQuery(levelSubjectsQueryOptions(api));
  const electives = useQuery({
    ...electivesQueryOptions(api),
    enabled: useCan('student', 'read'),
  });
  const [editing, setEditing] = useState<EditableLevel | null>(null);
  const [choosing, setChoosing] = useState<ElectiveTarget | null>(null);
  if (levels.isPending || rows.isPending) {
    return <PageSkeleton />;
  }
  if (levels.data === undefined || rows.data === undefined) {
    return <ErrorMessage error={levels.error ?? rows.error} />;
  }
  const groups = groupByLevel(levels.data, rows.data);
  if (groups.length === 0) {
    return <NoLevels />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <LevelCard
            key={group.id}
            group={group}
            onEdit={() => {
              setEditing(group);
            }}
          />
        ))}
      </div>
      {electives.data === undefined ? null : (
        <ElectivesCard
          list={electives.data}
          rows={rows.data}
          onChoose={setChoosing}
        />
      )}
      <LevelSubjectsSheet
        level={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
      {electives.data === undefined ? null : (
        <ElectiveTakersSheet
          target={choosing}
          list={electives.data}
          onClose={() => {
            setChoosing(null);
          }}
        />
      )}
    </div>
  );
}
