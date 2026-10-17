import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDaysIcon, SendIcon } from 'lucide-react';
import { ApiError, type LeaveDto } from '@eduvault/api-contract';
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  leaveSchoolDaysText,
} from '@eduvault/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  FieldError,
  Label,
  SelectField,
  Textarea,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateLeave } from '../../queries';
import { useToday } from '../calendar/use-today';
import {
  DEFAULT_LEAVE_TYPE,
  toLeaveBody,
  validateLeave,
  type LeaveErrors,
  type LeaveForm,
} from './leave-model';

const SENT_SUFFIX = 'Someone with leave approval will decide.';

function useRequestLeave(onDone: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: LeaveForm) =>
      api.leave.create({ body: toLeaveBody(form) }),
    onSuccess: async (leave: LeaveDto) => {
      await invalidateLeave(queryClient);
      onDone();
      toast.success(
        `Leave request sent: ${leaveSchoolDaysText(leave.days)}. ${SENT_SUFFIX}`
      );
    },
  });
}

const overlapOf = (error: unknown): string | undefined =>
  error instanceof ApiError && error.status === 409 ? error.message : undefined;

const otherErrorOf = (error: unknown): unknown =>
  overlapOf(error) === undefined ? error : null;

function formOf(data: FormData): LeaveForm {
  return {
    type: fieldValue(data, 'type'),
    startsOn: fieldValue(data, 'startsOn'),
    endsOn: fieldValue(data, 'endsOn'),
    reason: fieldValue(data, 'reason'),
    cover: fieldValue(data, 'cover'),
  };
}

function Dates({
  today,
  errors,
  overlap,
}: {
  today: string;
  errors: LeaveErrors;
  overlap: string | undefined;
}) {
  const [firstDay, setFirstDay] = useState('');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="First day"
          name="startsOn"
          type="date"
          min={today}
          required
          aria-invalid={errors.startsOn === undefined ? undefined : true}
          onChange={(event) => {
            setFirstDay(event.target.value);
          }}
        />
        <TextField
          label="Last day"
          name="endsOn"
          type="date"
          min={firstDay === '' ? today : firstDay}
          aria-invalid={errors.endsOn === undefined ? undefined : true}
        />
      </div>
      <p className="text-xs text-muted-foreground">Leave empty for one day.</p>
      <FieldError message={errors.startsOn} />
      <FieldError message={errors.endsOn} />
      <FieldError message={overlap} />
    </div>
  );
}

function Fields({
  today,
  errors,
  overlap,
}: {
  today: string;
  errors: LeaveErrors;
  overlap: string | undefined;
}) {
  return (
    <>
      <SelectField
        label="Type of leave"
        name="type"
        defaultValue={DEFAULT_LEAVE_TYPE}
      >
        {LEAVE_TYPES.map((type) => (
          <option key={type} value={type}>
            {LEAVE_TYPE_LABELS[type]}
          </option>
        ))}
      </SelectField>
      <Dates today={today} errors={errors} overlap={overlap} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="leave-reason">Reason</Label>
        <Textarea
          id="leave-reason"
          name="reason"
          placeholder="e.g. Doctor’s appointment"
          aria-invalid={errors.reason === undefined ? undefined : true}
        />
        <FieldError message={errors.reason} />
      </div>
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Cover for your classes (optional)"
          name="cover"
          autoComplete="off"
          placeholder="e.g. Ayo Bassey will take JSS 2 Mathematics"
        />
        <FieldError message={errors.cover} />
      </div>
    </>
  );
}

function RequestLeaveForm({ onClose }: { onClose: () => void }) {
  const today = useToday();
  const [errors, setErrors] = useState<LeaveErrors>({});
  const request = useRequestLeave(onClose);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formOf(new FormData(event.currentTarget));
    const found = validateLeave(form, today);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      request.mutate(form);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarDaysIcon className="size-4" />
          Request leave
        </DialogTitle>
        <DialogDescription>
          Someone with leave approval decides. You’ll see the decision here.
        </DialogDescription>
      </DialogHeader>
      <Fields
        today={today}
        errors={errors}
        overlap={overlapOf(request.error)}
      />
      <ErrorMessage error={otherErrorOf(request.error)} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={request.isPending}>
          <SendIcon />
          Send request
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RequestLeaveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <RequestLeaveForm
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
