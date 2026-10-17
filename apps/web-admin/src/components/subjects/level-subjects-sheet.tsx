import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react';
import {
  electiveRemoveConfirmMessage,
  electiveToCoreConfirmMessage,
  levelSubjectKindSchema,
  levelSubjectsSavedMessage,
  type LevelSubject,
} from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  NativeSelect,
  SelectField,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  allActiveSubjectsQueryOptions,
  invalidateLevelLists,
} from '../../queries';
import {
  addCore,
  addable,
  draftOf,
  kindChangeNeedsConfirmation,
  moveDown,
  moveUp,
  needsConfirmation,
  removeRow,
  setKind,
  toBody,
  type DraftRow,
} from './level-subjects-model';
import { SaveFooter } from './save-footer';

export interface EditableLevel {
  id: string;
  name: string;
  rows: LevelSubject[];
}

function useSaveLevelList(level: EditableLevel, onSaved: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: readonly DraftRow[]) =>
      api.levelSubjects.replace({
        params: { id: level.id },
        body: toBody(rows),
      }),
    onSuccess: async () => {
      await invalidateLevelLists(queryClient);
      toast.success(levelSubjectsSavedMessage(level.name));
      onSaved();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

type ClearingChange = 'remove' | 'core';

interface PendingChange {
  row: DraftRow;
  change: ClearingChange;
}

const CLEARING_COPY: Record<
  ClearingChange,
  {
    title: (name: string) => string;
    message: (count: number, name: string) => string;
    action: string;
  }
> = {
  remove: {
    title: (name) => `Remove ${name}?`,
    message: electiveRemoveConfirmMessage,
    action: 'Remove',
  },
  core: {
    title: (name) => `Make ${name} core?`,
    message: electiveToCoreConfirmMessage,
    action: 'Make core',
  },
};

function ClearTakersDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingChange | null;
  onCancel: () => void;
  onConfirm: (pending: PendingChange) => void;
}) {
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent>
        {pending === null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>
                {CLEARING_COPY[pending.change].title(pending.row.name)}
              </DialogTitle>
              <DialogDescription>
                {CLEARING_COPY[pending.change].message(
                  pending.row.takerCount,
                  pending.row.name
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onConfirm(pending);
                }}
              >
                {CLEARING_COPY[pending.change].action}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface RowHandlers {
  onUp: () => void;
  onDown: () => void;
  onKind: (kind: DraftRow['kind']) => void;
  onRemove: () => void;
}

function RowAction({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function DraftLine({
  row,
  index,
  last,
  handlers,
}: {
  row: DraftRow;
  index: number;
  last: boolean;
  handlers: RowHandlers;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border p-2">
      <span className="w-5 text-right text-xs text-muted-foreground">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {row.name}
      </span>
      <RowAction
        label={`Move ${row.name} up`}
        disabled={index === 0}
        onClick={handlers.onUp}
      >
        <ArrowUpIcon />
      </RowAction>
      <RowAction
        label={`Move ${row.name} down`}
        disabled={last}
        onClick={handlers.onDown}
      >
        <ArrowDownIcon />
      </RowAction>
      <NativeSelect
        size="sm"
        aria-label={`Kind of ${row.name}`}
        value={row.kind}
        onChange={(event) => {
          handlers.onKind(levelSubjectKindSchema.parse(event.target.value));
        }}
      >
        <option value="core">Core</option>
        <option value="elective">Elective</option>
      </NativeSelect>
      <RowAction label={`Remove ${row.name}`} onClick={handlers.onRemove}>
        <XIcon />
      </RowAction>
    </li>
  );
}

function AddSubjectSelect({
  choices,
  onAdd,
}: {
  choices: readonly { id: string; name: string }[];
  onAdd: (id: string) => void;
}) {
  return (
    <SelectField
      label="Add a subject"
      value=""
      disabled={choices.length === 0}
      onChange={(event) => {
        onAdd(event.target.value);
      }}
    >
      <option value="">Choose a subject</option>
      {choices.map((choice) => (
        <option key={choice.id} value={choice.id}>
          {choice.name}
        </option>
      ))}
    </SelectField>
  );
}

function MoreSubjectsHint({ shown, total }: { shown: number; total: number }) {
  return total > shown ? (
    <p className="text-xs text-muted-foreground">
      Showing {shown} of {total} active subjects.
    </p>
  ) : null;
}

function DraftList({
  rows,
  onChange,
  onKind,
  onRemove,
}: {
  rows: readonly DraftRow[];
  onChange: (rows: DraftRow[]) => void;
  onKind: (row: DraftRow, kind: DraftRow['kind']) => void;
  onRemove: (row: DraftRow) => void;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <DraftLine
          key={row.subjectId}
          row={row}
          index={index}
          last={index === rows.length - 1}
          handlers={{
            onUp: () => {
              onChange(moveUp(rows, index));
            },
            onDown: () => {
              onChange(moveDown(rows, index));
            },
            onKind: (kind) => {
              onKind(row, kind);
            },
            onRemove: () => {
              onRemove(row);
            },
          }}
        />
      ))}
    </ol>
  );
}

function useDraft(level: EditableLevel) {
  const [rows, setRows] = useState(() => draftOf(level.rows));
  const [confirming, setConfirming] = useState<PendingChange | null>(null);
  return {
    rows,
    setRows,
    confirming,
    remove: (row: DraftRow) => {
      if (needsConfirmation(row)) {
        setConfirming({ row, change: 'remove' });
      } else {
        setRows((current) => removeRow(current, row.subjectId));
      }
    },
    cancel: () => {
      setConfirming(null);
    },
    confirm: ({ row, change }: PendingChange) => {
      setRows((current) =>
        change === 'remove'
          ? removeRow(current, row.subjectId)
          : setKind(current, row.subjectId, 'core')
      );
      setConfirming(null);
    },
    changeKind: (row: DraftRow, kind: DraftRow['kind']) => {
      if (kindChangeNeedsConfirmation(row, kind)) {
        setConfirming({ row, change: 'core' });
      } else {
        setRows((current) => setKind(current, row.subjectId, kind));
      }
    },
  };
}

function LevelSubjectsBody({
  level,
  onClose,
}: {
  level: EditableLevel;
  onClose: () => void;
}) {
  const api = useApi();
  const active = useQuery(allActiveSubjectsQueryOptions(api));
  const draft = useDraft(level);
  const save = useSaveLevelList(level, onClose);
  const choices = addable(active.data?.items ?? [], draft.rows);
  const { rows, setRows } = draft;
  return (
    <>
      <SheetHeader>
        <SheetTitle>Subjects for {level.name}</SheetTitle>
        <SheetDescription>
          Core subjects are for every student at this level; electives only for
          those who choose them.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 overflow-y-auto px-4">
        <DraftList
          rows={rows}
          onChange={setRows}
          onKind={draft.changeKind}
          onRemove={draft.remove}
        />
        <AddSubjectSelect
          choices={choices}
          onAdd={(id) => {
            const picked = choices.find((choice) => choice.id === id);
            if (picked !== undefined) {
              setRows(addCore(rows, picked));
            }
          }}
        />
        <MoreSubjectsHint
          shown={active.data?.items.length ?? 0}
          total={active.data?.total ?? 0}
        />
        {active.isError ? <ErrorMessage error={active.error} /> : null}
      </div>
      <SaveFooter
        label="Save subjects"
        pending={save.isPending}
        onCancel={onClose}
        onSave={() => {
          save.mutate(rows);
        }}
      />
      <ClearTakersDialog
        pending={draft.confirming}
        onCancel={draft.cancel}
        onConfirm={draft.confirm}
      />
    </>
  );
}

export function LevelSubjectsSheet({
  level,
  onClose,
}: {
  level: EditableLevel | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={level !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className="overflow-y-auto">
        {level === null ? null : (
          <LevelSubjectsBody key={level.id} level={level} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}
