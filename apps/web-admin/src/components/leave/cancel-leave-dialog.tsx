import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LEAVE_REASON_MESSAGE, type LeaveDto } from '@eduvault/api-contract';
import { LEAVE_TYPE_LABELS, fmtDateRange } from '@eduvault/shared';
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
  Textarea,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateLeave } from '../../queries';

function useCancelLeave(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attempt: { leave: LeaveDto; reason: string }) =>
      api.leave.cancel({
        params: { id: attempt.leave.id },
        body: { reason: attempt.reason },
      }),
    onSuccess: async (_result, attempt) => {
      await invalidateLeave(queryClient);
      onClose();
      toast.success(
        `Leave cancelled. ${attempt.leave.requesterName} can see your reason.`
      );
    },
    onError: async () => {
      await invalidateLeave(queryClient);
    },
  });
}

function CancelForm({
  leave,
  onClose,
  onSubmit,
  missing,
  error,
  pending,
}: {
  leave: LeaveDto | null;
  onClose: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  missing: boolean;
  error: unknown;
  pending: boolean;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Cancel this leave?</DialogTitle>
        <DialogDescription>
          {leave === null
            ? null
            : `${leave.requesterName} · ${LEAVE_TYPE_LABELS[leave.type]} · ${fmtDateRange(leave.startsOn, leave.endsOn)}`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cancel-leave-reason">Reason</Label>
        <Textarea
          id="cancel-leave-reason"
          name="reason"
          placeholder="The staff member will see this"
          aria-invalid={missing ? true : undefined}
        />
        <FieldError message={missing ? LEAVE_REASON_MESSAGE : undefined} />
      </div>
      <ErrorMessage error={error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Keep leave
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          Cancel leave
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CancelLeaveDialog({
  leave,
  onClose,
}: {
  leave: LeaveDto | null;
  onClose: () => void;
}) {
  const cancel = useCancelLeave(onClose);
  const [missing, setMissing] = useState(false);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = fieldValue(
      new FormData(event.currentTarget),
      'reason'
    ).trim();
    if (reason === '' || leave === null) {
      setMissing(true);
      return;
    }
    setMissing(false);
    cancel.mutate({ leave, reason });
  }

  return (
    <Dialog
      open={leave !== null}
      onOpenChange={(open) => {
        if (!open) {
          cancel.reset();
          setMissing(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <CancelForm
          leave={leave}
          onClose={onClose}
          onSubmit={submit}
          missing={missing}
          error={cancel.error}
          pending={cancel.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
