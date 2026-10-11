import { useState, type SubmitEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, ClockIcon, Undo2Icon, UserXIcon } from 'lucide-react';
import {
  LEAVING_REASONS,
  type LeavingReason,
  type PlacementClass,
  type StudentDetail,
  type StudentTab,
} from '@eduvault/api-contract';
import { useCan, usePermissions } from '@eduvault/auth-client';
import { fmtDate } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  Label,
  NativeSelect,
  NativeSelectOption,
  SelectField,
  TextField,
  fieldValue,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  currentTermQueryOptions,
  nextTermClassesQueryOptions,
} from '../queries';
import { useToday } from './calendar/use-today';
import {
  useLeave,
  useMarkAway,
  useMoveForNextTerm,
  useUndoLeaving,
} from './student-actions';
import {
  classOptionLabel,
  defaultLastDay,
  defaultLeaveReason,
  defaultMoveClass,
  defaultNotSeenDate,
  leavesScope,
} from './student-lifecycle-model';

export type LifecycleDialog = 'mark-away' | 'leave' | 'undo' | 'move';

interface DialogProps {
  student: StudentDetail;
  onClose: () => void;
}

function Shell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Footer({
  submitLabel,
  icon,
  pending,
  destructive = false,
  onClose,
}: {
  submitLabel: string;
  icon: React.ReactNode;
  pending: boolean;
  destructive?: boolean;
  onClose: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        variant={destructive ? 'destructive' : 'default'}
        disabled={pending}
      >
        {icon}
        {submitLabel}
      </Button>
    </DialogFooter>
  );
}

export function MarkAwayDialog({ student, onClose }: DialogProps) {
  const today = useToday();
  const mark = useMarkAway(student, { today, onDone: onClose });
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const note = fieldValue(data, 'note').trim();
    mark.mutate({
      date: fieldValue(data, 'date'),
      ...(note === '' ? {} : { note }),
    });
  }
  return (
    <Shell
      title={`${student.firstName} not seen since…`}
      description="The first school day they were missed. After 5 weeks with no word from the family, they move to Inactive."
      onClose={onClose}
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <TextField
          label="Not seen since"
          name="date"
          type="date"
          max={today}
          defaultValue={defaultNotSeenDate(today)}
          required
        />
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Note"
            name="note"
            autoComplete="off"
            maxLength={500}
            placeholder="e.g. Phone calls to the family unanswered"
          />
          <p className="text-xs text-muted-foreground">
            Optional. Shown on the student’s record.
          </p>
        </div>
        <Footer
          submitLabel="Save"
          icon={<CheckIcon />}
          pending={mark.isPending}
          onClose={onClose}
        />
      </form>
    </Shell>
  );
}

function ReasonSelect({ defaultValue }: { defaultValue: LeavingReason }) {
  return (
    <SelectField label="Reason" name="reason" defaultValue={defaultValue}>
      {LEAVING_REASONS.map((reason) => (
        <option key={reason.code} value={reason.code}>
          {reason.label}
        </option>
      ))}
    </SelectField>
  );
}

const reasonOf = (value: string): LeavingReason =>
  LEAVING_REASONS.find((reason) => reason.code === value)?.code ?? 'other';

export function LeaveDialog({
  student,
  onClose,
  onOpenTab,
}: DialogProps & { onOpenTab: (tab: StudentTab) => void }) {
  const today = useToday();
  const leave = useLeave(student, { onOpenTab, onDone: onClose });
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const note = fieldValue(data, 'note').trim();
    leave.mutate({
      reason: reasonOf(fieldValue(data, 'reason')),
      lastDay: fieldValue(data, 'lastDay'),
      ...(note === '' ? {} : { note }),
    });
  }
  return (
    <Shell
      title={`Record ${student.firstName} leaving`}
      description="Takes the student off the roll and out of future billing. Fees and history are kept; students are never deleted."
      onClose={onClose}
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReasonSelect defaultValue={defaultLeaveReason(student.life)} />
          <TextField
            label="Last day attended"
            name="lastDay"
            type="date"
            max={today}
            defaultValue={defaultLastDay(student, today)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Note"
            name="note"
            autoComplete="off"
            maxLength={500}
            placeholder="e.g. Family moved to Abuja"
          />
          <p className="text-xs text-muted-foreground">
            Shown on the student’s record and in recent activity.
          </p>
        </div>
        <Footer
          submitLabel="Record leaving"
          icon={<UserXIcon />}
          pending={leave.isPending}
          destructive
          onClose={onClose}
        />
      </form>
    </Shell>
  );
}

export function UndoLeavingDialog({ student, onClose }: DialogProps) {
  const undo = useUndoLeaving(student, onClose);
  const exit = student.exit;
  const word = exit?.kind === 'graduated' ? 'graduation' : 'leaving';
  const by =
    student.archivedBy === null ? '' : ` by ${student.archivedBy.name}`;
  return (
    <Shell
      title={`Undo ${student.firstName}’s ${word}?`}
      description={`${student.firstName} goes back on the roll as if the ${word} was never recorded. Use this only to correct a mistake.`}
      onClose={onClose}
    >
      {exit === null ? null : (
        <p className="text-sm">
          {fmtDate(exit.on)} · {exit.reason} · recorded{by} on{' '}
          {fmtDate(exit.recordedOn)}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={undo.isPending}
          onClick={() => {
            undo.mutate();
          }}
        >
          <Undo2Icon />
          Undo {word}
        </Button>
      </DialogFooter>
    </Shell>
  );
}

function useCurrentTermName(): string {
  const api = useApi();
  const canSee = useCan('session', 'read');
  const current = useQuery({
    ...currentTermQueryOptions(api),
    enabled: canSee,
  });
  return current.data?.term?.name ?? 'The current term';
}

function ClassSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly PlacementClass[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="move-class">{label}</Label>
      <NativeSelect
        id="move-class"
        className="w-full"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {options.map((row) => (
          <NativeSelectOption key={row.id} value={row.id}>
            {classOptionLabel(row)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

type Movable = StudentDetail & { nextTerm: { id: string; name: string } };

function MoveForm({
  student,
  onClose,
}: {
  student: Movable;
  onClose: () => void;
}) {
  const api = useApi();
  const { campusScope } = usePermissions();
  const currentTerm = useCurrentTermName();
  const classes = useQuery(nextTermClassesQueryOptions(api, student.id));
  const options = classes.data ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const classId = picked ?? defaultMoveClass(student, options);
  const chosen = options.find((row) => row.id === classId);
  const move = useMoveForNextTerm(student, {
    currentTerm,
    nextTerm: student.nextTerm.name,
    onDone: onClose,
  });
  const where = student.currentPlacement?.className ?? 'the current class';
  return (
    <Shell
      title="Move for next term"
      description={`${currentTerm} stays in ${where}; ${student.nextTerm.name} gets a new placement.`}
      onClose={onClose}
    >
      <ClassSelect
        label={`${student.nextTerm.name} class`}
        value={classId}
        options={options}
        onChange={setPicked}
      />
      {chosen !== undefined && leavesScope(chosen.campus.id, campusScope) ? (
        <Alert>
          <ClockIcon />
          <AlertDescription>
            {student.firstName} will no longer appear in your list from{' '}
            {student.nextTerm.name}.
          </AlertDescription>
        </Alert>
      ) : null}
      <ErrorMessage error={classes.error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={move.isPending || classId === ''}
          onClick={() => {
            move.mutate({ termId: student.nextTerm.id, classArmId: classId });
          }}
        >
          Add placement
        </Button>
      </DialogFooter>
    </Shell>
  );
}

export function MoveDialog({ student, onClose }: DialogProps) {
  return student.nextTerm === null ? null : (
    <MoveForm
      student={{ ...student, nextTerm: student.nextTerm }}
      onClose={onClose}
    />
  );
}

export function StudentLifecycleDialog({
  dialog,
  student,
  onClose,
  onOpenTab,
}: DialogProps & {
  dialog: LifecycleDialog;
  onOpenTab: (tab: StudentTab) => void;
}) {
  switch (dialog) {
    case 'mark-away': {
      return <MarkAwayDialog student={student} onClose={onClose} />;
    }
    case 'leave': {
      return (
        <LeaveDialog
          student={student}
          onClose={onClose}
          onOpenTab={onOpenTab}
        />
      );
    }
    case 'undo': {
      return <UndoLeavingDialog student={student} onClose={onClose} />;
    }
    case 'move': {
      return <MoveDialog student={student} onClose={onClose} />;
    }
  }
}
