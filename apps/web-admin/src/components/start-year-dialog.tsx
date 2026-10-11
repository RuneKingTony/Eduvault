import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, CalendarPlusIcon, InfoIcon } from 'lucide-react';
import type {
  ClassChoice,
  NewSchoolYearGroup,
  NewSchoolYearPreview,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { countOf } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  FieldError,
  Label,
  NativeSelect,
  NativeSelectOption,
  Skeleton,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateYearStart, newSchoolYearQueryOptions } from '../queries';
import {
  EMPTY_SELECTION,
  canStart,
  groupErrors,
  groupKeyOf,
  groupLabel,
  isLocked,
  moveTarget,
  outcomeOf,
  repeatTarget,
  startRows,
  startedToast,
  summarize,
  summaryText,
  type StartSelection,
} from './start-year-model';

interface Handlers {
  onOpenCalendar: () => void;
  onClose: () => void;
}

function useStart(preview: NewSchoolYearPreview, handlers: Handlers) {
  const api = useApi();
  const queryClient = useQueryClient();
  const canSeeCalendar = useCan('session', 'read');
  return useMutation({
    mutationFn: (selection: StartSelection) =>
      api.students.startNewSchoolYear({
        body: {
          targetYearId: preview.targetYear.id,
          rows: startRows(preview, selection),
        },
      }),
    onSuccess: async (result) => {
      await invalidateYearStart(queryClient);
      const text = startedToast(preview, result);
      if (canSeeCalendar && !preview.targetYear.firstTerm.isCurrent) {
        toast.success(text, {
          action: {
            label: 'School years and terms',
            onClick: handlers.onOpenCalendar,
          },
        });
      } else {
        toast.success(text);
      }
      handlers.onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function ClassPicker({
  id,
  label,
  choices,
  value,
  onChange,
}: {
  id: string;
  label: string;
  choices: readonly ClassChoice[];
  value: string;
  onChange: (classId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        className="w-full"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <NativeSelectOption value="">Choose a class</NativeSelectOption>
        {choices.map((choice) => (
          <NativeSelectOption key={choice.id} value={choice.id}>
            {choice.name} · {choice.campusName}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function GroupTitle({
  group,
  selection,
}: {
  group: NewSchoolYearGroup;
  selection: StartSelection;
}) {
  const target = group.toClass;
  let arrow = 'Graduate';
  if (!group.level.isFinalYear) {
    arrow = target?.name ?? `Choose a ${group.nextLevel?.name ?? 'next'} class`;
  }
  const picked = group.classChoices.find(
    (choice) => choice.id === moveTarget(group, selection)
  );
  return (
    <div className="flex flex-wrap items-center gap-2 font-medium">
      <span>{groupLabel(group)}</span>
      <ArrowRightIcon className="size-4 text-muted-foreground" />
      <span>{picked?.name ?? arrow}</span>
      <span className="ml-auto text-sm font-normal text-muted-foreground">
        {countOf(group.students.length, 'student', 'students')}
      </span>
    </div>
  );
}

function StudentTicks({
  group,
  selection,
  onToggle,
}: {
  group: NewSchoolYearGroup;
  selection: StartSelection;
  onToggle: (studentId: string) => void;
}) {
  return (
    <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {group.students.map((student) => {
        const id = `start-${student.id}`;
        const repeats = outcomeOf(group, student.id, selection) === 'repeat';
        return (
          <li key={student.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              id={id}
              checked={!repeats}
              onCheckedChange={() => {
                onToggle(student.id);
              }}
            />
            <Label htmlFor={id} className="font-normal">
              {student.firstName} {student.lastName}
              {repeats ? (
                <span className="text-muted-foreground">
                  {' '}
                  (repeats {group.level.name})
                </span>
              ) : null}
            </Label>
          </li>
        );
      })}
    </ul>
  );
}

function InactiveNote({ group }: { group: NewSchoolYearGroup }) {
  if (group.inactive.length === 0) {
    return null;
  }
  const names = group.inactive.map((student) => student.name).join(', ');
  return (
    <p className="text-xs text-muted-foreground">
      {group.inactive.length} inactive: {names}. Not moved. Mark them back in
      school to include them, or record their leaving.
    </p>
  );
}

interface GroupProps {
  group: NewSchoolYearGroup;
  selection: StartSelection;
  canGraduate: boolean;
  onChange: (next: StartSelection) => void;
}

function MovePicker({ group, selection, onChange }: GroupProps) {
  const key = groupKeyOf(group);
  const needsPick = !group.level.isFinalYear && group.toClass === null;
  return (
    <>
      {needsPick ? (
        <ClassPicker
          id={`target-${key}`}
          label={`Choose a ${group.nextLevel?.name ?? 'next level'} class`}
          choices={group.classChoices}
          value={selection.targets[key] ?? ''}
          onChange={(classId) => {
            onChange({
              ...selection,
              targets: { ...selection.targets, [key]: classId },
            });
          }}
        />
      ) : null}
      <FieldError message={groupErrors(group, selection).move ?? undefined} />
    </>
  );
}

function RepeatPicker({ group, selection, onChange }: GroupProps) {
  const key = groupKeyOf(group);
  const needsPick = repeatTarget(group, selection) === null;
  return (
    <>
      {group.repeatClassChoices.length > 0 ? (
        <ClassPicker
          id={`repeat-${key}`}
          label="Class for those repeating"
          choices={group.repeatClassChoices}
          value={selection.repeatTargets[key] ?? ''}
          onChange={(classId) => {
            onChange({
              ...selection,
              repeatTargets: { ...selection.repeatTargets, [key]: classId },
            });
          }}
        />
      ) : null}
      <FieldError
        message={
          needsPick
            ? (groupErrors(group, selection).repeat ?? undefined)
            : undefined
        }
      />
    </>
  );
}

function toggled(selection: StartSelection, studentId: string): StartSelection {
  const repeating = new Set(selection.repeating);
  if (!repeating.delete(studentId)) {
    repeating.add(studentId);
  }
  return { ...selection, repeating };
}

function GroupSection(props: GroupProps) {
  const { group, selection, canGraduate, onChange } = props;
  if (isLocked(group, canGraduate)) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border p-3">
        <GroupTitle group={group} selection={selection} />
        <p className="text-xs text-muted-foreground">
          Graduating needs permission to record leavers. These students stay as
          they are for now.
        </p>
        <InactiveNote group={group} />
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <GroupTitle group={group} selection={selection} />
      <MovePicker {...props} />
      <RepeatPicker {...props} />
      <StudentTicks
        group={group}
        selection={selection}
        onToggle={(studentId) => {
          onChange(toggled(selection, studentId));
        }}
      />
      <InactiveNote group={group} />
    </section>
  );
}

function StartHeader({ preview }: { preview: NewSchoolYearPreview }) {
  const { name } = preview.targetYear;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarPlusIcon className="size-4" />
          Start {name}
        </DialogTitle>
        <DialogDescription>
          Ticked students move up a level for {name}. Untick anyone repeating
          the year. Final-year students graduate.
        </DialogDescription>
      </DialogHeader>
      {preview.alreadyInTargetYear > 0 ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            {countOf(preview.alreadyInTargetYear, 'student is', 'students are')}{' '}
            already in {name} and not listed.
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function StartFooter({
  preview,
  selection,
  start,
  onClose,
}: {
  preview: NewSchoolYearPreview;
  selection: StartSelection;
  start: ReturnType<typeof useStart>;
  onClose: () => void;
}) {
  return (
    <>
      <div className="text-sm">
        <p className="font-medium">
          {summaryText(summarize(preview, selection))}
        </p>
        <p className="text-xs text-muted-foreground">
          Old year’s charges stay on Who owes.
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={start.isPending || !canStart(preview, selection)}
          onClick={() => {
            start.mutate(selection);
          }}
        >
          <CalendarPlusIcon />
          Start {preview.targetYear.name}
        </Button>
      </DialogFooter>
    </>
  );
}

function StartForm({
  preview,
  handlers,
}: {
  preview: NewSchoolYearPreview;
  handlers: Handlers;
}) {
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const start = useStart(preview, handlers);
  return (
    <>
      <StartHeader preview={preview} />
      <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
        {preview.groups.map((group) => (
          <GroupSection
            key={groupKeyOf(group)}
            group={group}
            selection={selection}
            canGraduate={preview.canGraduate}
            onChange={setSelection}
          />
        ))}
      </div>
      <StartFooter
        preview={preview}
        selection={selection}
        start={start}
        onClose={handlers.onClose}
      />
    </>
  );
}

function LoadingGroups() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function StartYearDialog({
  onOpenChange,
  onOpenCalendar,
}: {
  onOpenChange: (open: boolean) => void;
  onOpenCalendar: () => void;
}) {
  const api = useApi();
  const preview = useQuery(newSchoolYearQueryOptions(api));
  const handlers = {
    onOpenCalendar,
    onClose: () => {
      onOpenChange(false);
    },
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        {preview.data === undefined ? (
          <>
            <DialogHeader>
              <DialogTitle>Start the new school year</DialogTitle>
              <DialogDescription>
                Move the roll up a level for the next school year.
              </DialogDescription>
            </DialogHeader>
            {preview.isError ? (
              <ErrorMessage error={preview.error} />
            ) : (
              <LoadingGroups />
            )}
          </>
        ) : (
          <StartForm preview={preview.data} handlers={handlers} />
        )}
      </DialogContent>
    </Dialog>
  );
}
