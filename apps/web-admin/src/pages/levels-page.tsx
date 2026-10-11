import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EllipsisIcon, PlusIcon } from 'lucide-react';
import type { ClassLevel } from '@eduvault/api-contract';
import { Can, useCan } from '@eduvault/auth-client';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorMessage,
  PageSkeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { LevelDialog } from '../components/level-dialog';
import { classLevelsQueryOptions, invalidateLevels } from '../queries';

function useMoveLevel() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ level, to }: { level: ClassLevel; to: number }) =>
      api.classLevels.update({
        params: { id: level.id },
        body: { sequence: to },
      }),
    onSuccess: () => invalidateLevels(queryClient),
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function RowMenu({
  level,
  count,
  onEdit,
}: {
  level: ClassLevel;
  count: number;
  onEdit: (level: ClassLevel) => void;
}) {
  const move = useMoveLevel();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${level.name}`}
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            onEdit(level);
          }}
        >
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={level.sequence <= 1}
          onSelect={() => {
            move.mutate({ level, to: level.sequence - 1 });
          }}
        >
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={level.sequence >= count}
          onSelect={() => {
            move.mutate({ level, to: level.sequence + 1 });
          }}
        >
          Move down
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LevelRow({
  level,
  levels,
  canChange,
  onEdit,
}: {
  level: ClassLevel;
  levels: readonly ClassLevel[];
  canChange: boolean;
  onEdit: (level: ClassLevel) => void;
}) {
  const next = levels.find((candidate) => candidate.id === level.nextLevelId);
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{level.code}</TableCell>
      <TableCell className="font-medium">{level.name}</TableCell>
      <TableCell className={next === undefined ? 'text-muted-foreground' : ''}>
        {next?.name ?? 'Final year'}
      </TableCell>
      {canChange ? (
        <TableCell className="text-right">
          <RowMenu level={level} count={levels.length} onEdit={onEdit} />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

type DialogState = { level?: ClassLevel } | null;

function LevelsHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>Levels</h1>
        <p className="text-sm text-muted-foreground">
          Year groups every campus uses, in order. The last one is the final
          year.
        </p>
      </div>
      <Can permission="class:update">
        <Button type="button" onClick={onAdd}>
          <PlusIcon />
          Add level
        </Button>
      </Can>
    </header>
  );
}

function LevelsTable({
  levels,
  onEdit,
}: {
  levels: readonly ClassLevel[];
  onEdit: (level: ClassLevel) => void;
}) {
  const canChange = useCan('class', 'update');
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Next level</TableHead>
            {canChange ? (
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {levels.map((level) => (
            <LevelRow
              key={level.id}
              level={level}
              levels={levels}
              canChange={canChange}
              onEdit={onEdit}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function LevelsPage() {
  const api = useApi();
  const levels = useQuery(classLevelsQueryOptions(api));
  const [dialog, setDialog] = useState<DialogState>(null);
  if (levels.isError) {
    return <ErrorMessage error={levels.error} />;
  }
  if (levels.data === undefined) {
    return <PageSkeleton rows={2} />;
  }
  return (
    <section className="flex flex-col gap-4">
      <LevelsHeader
        onAdd={() => {
          setDialog({});
        }}
      />
      <LevelsTable
        levels={levels.data}
        onEdit={(picked) => {
          setDialog({ level: picked });
        }}
      />
      {dialog === null ? null : (
        <LevelDialog
          key={dialog.level?.id ?? 'new'}
          level={dialog.level}
          levels={levels.data}
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
        />
      )}
    </section>
  );
}
