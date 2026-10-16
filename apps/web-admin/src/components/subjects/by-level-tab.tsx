import { useQuery } from '@tanstack/react-query';
import { BookMarkedIcon } from 'lucide-react';
import type { LevelSubject } from '@eduvault/api-contract';
import {
  Badge,
  Card,
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
  levelSubjectsQueryOptions,
} from '../../queries';

interface LevelGroup {
  id: string;
  name: string;
  rows: LevelSubject[];
}

export function groupByLevel(
  levels: readonly { id: string; name: string }[],
  rows: readonly LevelSubject[]
): LevelGroup[] {
  return levels
    .map((level) => ({
      id: level.id,
      name: level.name,
      rows: rows
        .filter((row) => row.classLevelId === level.id)
        .toSorted((a, b) => a.sequence - b.sequence),
    }))
    .filter((group) => group.rows.length > 0);
}

function LevelCard({ group }: { group: LevelGroup }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {group.name}
          <Badge variant="secondary">{group.rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
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
                  <Badge
                    variant={row.kind === 'core' ? 'secondary' : 'default'}
                  >
                    {row.kind === 'core' ? 'Core' : 'Elective'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function ByLevelTab() {
  const api = useApi();
  const levels = useQuery(classLevelsQueryOptions(api));
  const rows = useQuery(levelSubjectsQueryOptions(api));
  if (levels.isPending || rows.isPending) {
    return <PageSkeleton />;
  }
  if (levels.data === undefined || rows.data === undefined) {
    return <ErrorMessage error={levels.error ?? rows.error} />;
  }
  const groups = groupByLevel(levels.data, rows.data);
  if (groups.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookMarkedIcon />
          </EmptyMedia>
          <EmptyTitle>No subjects yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <LevelCard key={group.id} group={group} />
      ))}
    </div>
  );
}
