import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckIcon, XIcon } from 'lucide-react';
import {
  ApiError,
  DECLINE_REASON_MESSAGE,
  type ApprovalItem,
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
  Label,
  Textarea,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi, type Api } from '../../api';
import { invalidateApprovals } from '../../queries';
import {
  ALREADY_DECIDED_TOAST,
  APPROVAL_KIND_UI,
  DECLINED_TOAST,
  amountOf,
  approvedMessage,
} from './approval-copy';

function approveRequest(api: Api, item: ApprovalItem): Promise<unknown> {
  return api[APPROVAL_KIND_UI[item.kind].resource].approve({
    params: { id: item.id },
  });
}

function declineRequest(
  api: Api,
  item: ApprovalItem,
  reason: string
): Promise<unknown> {
  return api[APPROVAL_KIND_UI[item.kind].resource].decline({
    params: { id: item.id },
    body: { reason },
  });
}

const isDecidedElsewhere = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 409 &&
  error.body.code === 'AlreadyDecided';

function useDecision(onClose: () => void) {
  const queryClient = useQueryClient();
  return {
    settled: async (error: unknown) => {
      await invalidateApprovals(queryClient);
      if (isDecidedElsewhere(error)) {
        toast.warning(ALREADY_DECIDED_TOAST);
      }
    },
    done: async () => {
      await invalidateApprovals(queryClient);
      onClose();
    },
  };
}

function useApprove(onClose: () => void) {
  const api = useApi();
  const navigate = useNavigate();
  const decision = useDecision(onClose);
  return useMutation({
    mutationFn: (target: ApprovalItem) => approveRequest(api, target),
    onSuccess: async (_result, target) => {
      await decision.done();
      const { action } = APPROVAL_KIND_UI[target.kind].approvedToast;
      toast.success(
        approvedMessage(target),
        action === null
          ? undefined
          : {
              action: {
                label: action.label,
                onClick: () => {
                  void navigate({ to: action.to });
                },
              },
            }
      );
    },
    onError: async (error) => {
      await decision.settled(error);
    },
  });
}

function RequestDetails({
  item,
  currency,
}: {
  item: ApprovalItem;
  currency: string;
}) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Details</dt>
        <dd className="text-right font-semibold">{item.details}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="text-right font-semibold">{amountOf(item, currency)}</dd>
      </div>
    </dl>
  );
}

interface DialogProps {
  item: ApprovalItem | null;
  currency: string;
  onClose: () => void;
}

export function ApproveDialog({ item, currency, onClose }: DialogProps) {
  const approve = useApprove(onClose);
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          approve.reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve this request?</DialogTitle>
          <DialogDescription>
            {item?.label} · asked by {item?.createdBy.name}
          </DialogDescription>
        </DialogHeader>
        {item === null ? null : (
          <>
            <RequestDetails item={item} currency={currency} />
            <p className="rounded-md bg-muted p-3 text-sm">
              {APPROVAL_KIND_UI[item.kind].approveEffect}
            </p>
          </>
        )}
        <ErrorMessage error={approve.error} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={approve.isPending || item === null}
            onClick={() => {
              if (item !== null) {
                approve.mutate(item);
              }
            }}
          >
            <CheckIcon />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useDecline(onClose: () => void) {
  const api = useApi();
  const decision = useDecision(onClose);
  return useMutation({
    mutationFn: (attempt: { item: ApprovalItem; reason: string }) =>
      declineRequest(api, attempt.item, attempt.reason),
    onSuccess: async () => {
      await decision.done();
      toast.warning(DECLINED_TOAST);
    },
    onError: async (error) => {
      await decision.settled(error);
    },
  });
}

function DeclineForm({
  item,
  onClose,
  onSubmit,
  missing,
  error,
  pending,
}: {
  item: ApprovalItem | null;
  onClose: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  missing: boolean;
  error: unknown;
  pending: boolean;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Decline this request?</DialogTitle>
        <DialogDescription>
          {item === null
            ? 'The request stays on record with your reason.'
            : `The request stays on record with your reason. ${APPROVAL_KIND_UI[item.kind].declineEffect}`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decline-reason">Reason</Label>
        <Textarea
          id="decline-reason"
          name="reason"
          placeholder="The person who asked will see this"
          aria-invalid={missing ? true : undefined}
        />
        {missing ? (
          <p role="alert" className="text-sm text-destructive">
            {DECLINE_REASON_MESSAGE}
          </p>
        ) : null}
      </div>
      <ErrorMessage error={error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          <XIcon />
          Decline
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeclineDialog({
  item,
  onClose,
}: Omit<DialogProps, 'currency'>) {
  const decline = useDecline(onClose);
  const [missing, setMissing] = useState(false);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = fieldValue(
      new FormData(event.currentTarget),
      'reason'
    ).trim();
    if (reason === '' || item === null) {
      setMissing(true);
      return;
    }
    setMissing(false);
    decline.mutate({ item, reason });
  }

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          decline.reset();
          setMissing(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DeclineForm
          item={item}
          onClose={onClose}
          onSubmit={submit}
          missing={missing}
          error={decline.error}
          pending={decline.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
