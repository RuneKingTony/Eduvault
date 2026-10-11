import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GraduationCapIcon, TriangleAlertIcon } from 'lucide-react';
import type {
  CalendarCurrent,
  ClassDetail,
  RosterRow,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
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
  Label,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateYearStart } from '../queries';
import {
  byLastName,
  earlyConfirmText,
  graduatedToast,
  needsEarlyConfirmation,
} from './graduate-class-model';

interface Handlers {
  onClose: () => void;
  onOpenGraduated: () => void;
  onOpenStartYear: () => void;
}

function useGraduate(classRow: ClassDetail, handlers: Handlers) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentIds: string[]) =>
      api.classes.graduate({
        params: { id: classRow.id },
        body: { studentIds },
      }),
    onSuccess: async (result) => {
      await invalidateYearStart(queryClient);
      toast.success(graduatedToast(result.graduated), {
        action: { label: 'Graduated tab', onClick: handlers.onOpenGraduated },
      });
      handlers.onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function RosterTicks({
  roster,
  unticked,
  onToggle,
}: {
  roster: readonly RosterRow[];
  unticked: ReadonlySet<string>;
  onToggle: (studentId: string) => void;
}) {
  return (
    <ul className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
      {roster.map((row) => (
        <li key={row.studentId} className="flex items-start gap-2">
          <Checkbox
            id={`graduate-${row.studentId}`}
            checked={!unticked.has(row.studentId)}
            onCheckedChange={() => {
              onToggle(row.studentId);
            }}
          />
          <Label
            htmlFor={`graduate-${row.studentId}`}
            className="flex flex-col items-start gap-0 font-normal"
          >
            <span className="font-bold">{row.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {row.admissionNumber}
            </span>
          </Label>
        </li>
      ))}
    </ul>
  );
}

function EarlyConfirmation({
  current,
  pending,
  onBack,
  onConfirm,
}: {
  current: CalendarCurrent | undefined;
  pending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Graduate during {current?.term?.name ?? 'this term'}?
        </DialogTitle>
        <DialogDescription>{earlyConfirmText(current)}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onBack}>
          Go back
        </Button>
        <Button type="button" disabled={pending} onClick={onConfirm}>
          Graduate now
        </Button>
      </DialogFooter>
    </>
  );
}

interface FormProps extends Handlers {
  classRow: ClassDetail;
  roster: readonly RosterRow[];
  current: CalendarCurrent | undefined;
}

function useGraduateForm({
  classRow,
  roster,
  current,
  ...handlers
}: FormProps) {
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const graduate = useGraduate(classRow, handlers);
  const ids = roster
    .map((row) => row.studentId)
    .filter((id) => !unticked.has(id));
  return {
    unticked,
    confirming,
    graduate,
    ids,
    back: () => {
      setConfirming(false);
    },
    toggle: (id: string) => {
      const next = new Set(unticked);
      if (!next.delete(id)) {
        next.add(id);
      }
      setUnticked(next);
    },
    submit: () => {
      if (needsEarlyConfirmation(current) && !confirming) {
        setConfirming(true);
      } else {
        graduate.mutate(ids);
      }
    },
  };
}

function StartYearNote({ onOpen }: { onOpen: () => void }) {
  return (
    <p className="text-xs text-muted-foreground">
      To move the whole school into the next year, graduations included, use{' '}
      <Button type="button" variant="link" size="xs" onClick={onOpen}>
        Start new school year
      </Button>{' '}
      on Students.
    </p>
  );
}

type GraduateForm = ReturnType<typeof useGraduateForm>;

function GraduateBody({
  props,
  form,
}: {
  props: FormProps;
  form: GraduateForm;
}) {
  const { classRow, roster } = props;
  const canPlace = useCan('enrollment', 'place');
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <GraduationCapIcon className="size-4" />
          Graduate {classRow.displayName}
        </DialogTitle>
        <DialogDescription>
          Ticked students move to Graduated for this school year. Untick anyone
          repeating the year.
        </DialogDescription>
      </DialogHeader>
      <Alert>
        <TriangleAlertIcon />
        <AlertDescription>
          Usually done once, at the end of Third term. Graduates leave the roll
          and are not billed again; what they owe stays in Who owes.
        </AlertDescription>
      </Alert>
      <RosterTicks
        roster={byLastName(roster)}
        unticked={form.unticked}
        onToggle={form.toggle}
      />
      {canPlace ? <StartYearNote onOpen={props.onOpenStartYear} /> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={props.onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={form.ids.length === 0 || form.graduate.isPending}
          onClick={form.submit}
        >
          <GraduationCapIcon />
          Graduate ticked students
        </Button>
      </DialogFooter>
    </>
  );
}

function GraduateContent(props: FormProps) {
  const form = useGraduateForm(props);
  if (form.confirming) {
    return (
      <EarlyConfirmation
        current={props.current}
        pending={form.graduate.isPending}
        onBack={form.back}
        onConfirm={form.submit}
      />
    );
  }
  return <GraduateBody props={props} form={form} />;
}

export function GraduateClassDialog(props: FormProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <GraduateContent {...props} />
      </DialogContent>
    </Dialog>
  );
}
