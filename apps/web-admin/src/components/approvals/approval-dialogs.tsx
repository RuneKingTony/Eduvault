import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { XIcon } from 'lucide-react';
import {
  ApiError,
  DECLINE_REASON_MESSAGE,
  WALLET_PAYOUT_REFERENCE_MESSAGE,
  type ApprovalItem,
} from '@eduvault/api-contract';
import { ConfirmDialog, toast } from '@eduvault/ui';
import { useApi, type Api } from '../../api';
import { invalidateApprovals } from '../../queries';
import {
  ALREADY_DECIDED_TOAST,
  APPROVAL_KIND_UI,
  DECLINED_TOAST,
  amountOf,
  approvedMessage,
} from './approval-copy';

interface Approval {
  item: ApprovalItem;
  payoutReference: string;
}

function approveRequest(api: Api, approval: Approval): Promise<unknown> {
  const { item, payoutReference } = approval;
  const { resource } = APPROVAL_KIND_UI[item.kind];
  if (resource === 'walletRefunds') {
    return api.walletRefunds.approve({
      params: { id: item.id },
      body: { payoutReference },
    });
  }
  return api[resource].approve({ params: { id: item.id } });
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
    mutationFn: (approval: Approval) => approveRequest(api, approval),
    onSuccess: async (_result, { item }) => {
      await decision.done();
      const { action } = APPROVAL_KIND_UI[item.kind].approvedToast;
      toast.success(
        approvedMessage(item),
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

const detailsOf = (item: ApprovalItem, currency: string) => [
  { label: 'Details', value: item.details },
  { label: 'Amount', value: amountOf(item, currency) },
];

interface DialogProps {
  item: ApprovalItem | null;
  currency: string;
  onClose: () => void;
}

export function ApproveDialog({ item, currency, onClose }: DialogProps) {
  const approve = useApprove(onClose);
  return (
    <ConfirmDialog
      open={item !== null}
      title="Approve this request?"
      description={`${item?.label ?? ''} · asked by ${item?.createdBy.name ?? ''}`}
      details={item === null ? [] : detailsOf(item, currency)}
      note={
        item === null ? undefined : APPROVAL_KIND_UI[item.kind].approveEffect
      }
      reason={
        item?.kind === 'wallet_refund'
          ? {
              label: 'Payout reference',
              placeholder: 'The bank’s own reference for the transfer',
              missing: WALLET_PAYOUT_REFERENCE_MESSAGE,
            }
          : undefined
      }
      confirmLabel="Approve"
      pending={approve.isPending}
      error={approve.error}
      onConfirm={(payoutReference) => {
        if (item !== null) {
          approve.mutate({ item, payoutReference });
        }
      }}
      onCancel={() => {
        approve.reset();
        onClose();
      }}
    />
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

export function DeclineDialog({
  item,
  onClose,
}: Omit<DialogProps, 'currency'>) {
  const decline = useDecline(onClose);
  return (
    <ConfirmDialog
      open={item !== null}
      title="Decline this request?"
      description={
        item === null
          ? 'The request stays on record with your reason.'
          : `The request stays on record with your reason. ${APPROVAL_KIND_UI[item.kind].declineEffect}`
      }
      reason={{
        label: 'Reason',
        placeholder: 'The person who asked will see this',
        missing: DECLINE_REASON_MESSAGE,
      }}
      tone="destructive"
      icon={<XIcon />}
      confirmLabel="Decline"
      pending={decline.isPending}
      error={decline.error}
      onConfirm={(reason) => {
        if (item !== null) {
          decline.mutate({ item, reason });
        }
      }}
      onCancel={() => {
        decline.reset();
        onClose();
      }}
    />
  );
}
