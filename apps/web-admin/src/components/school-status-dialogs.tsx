import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import type { PlatformSchool } from '@eduvault/api-contract';
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
  notify,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidatePlatform } from '../queries';

type Change = 'suspend' | 'reactivate';

function useStatusChange(
  school: PlatformSchool,
  change: Change,
  onDone: () => void
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.platform.schools[change]({ params: { id: school.id } }),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
      if (change === 'suspend') {
        notify.warning(`${school.name} suspended.`);
      } else {
        notify.success(`${school.name} reactivated.`);
      }
      onDone();
    },
  });
}

const COPY = {
  suspend: {
    title: 'Suspend',
    description:
      'Staff, students and guardians can’t sign in while the school is suspended. No data changes.',
    note: 'Use this for unpaid subscriptions or a security incident. The audit log records who suspended it.',
    icon: TriangleAlertIcon,
    action: 'Suspend school',
    variant: 'destructive',
  },
  reactivate: {
    title: 'Reactivate',
    description: 'Everyone can sign in again.',
    note: 'Reactivating is immediate.',
    icon: InfoIcon,
    action: 'Reactivate',
    variant: 'default',
  },
} as const;

export function SchoolStatusDialog({
  school,
  change,
  open,
  onOpenChange,
}: {
  school: PlatformSchool;
  change: Change;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mutation = useStatusChange(school, change, () => {
    onOpenChange(false);
  });
  const copy = COPY[change];
  const Icon = copy.icon;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {copy.title} {school.name}?
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <Alert>
          <Icon />
          <AlertDescription>{copy.note}</AlertDescription>
        </Alert>
        <ErrorMessage error={mutation.error} />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={copy.variant}
            disabled={mutation.isPending}
            onClick={() => {
              mutation.mutate();
            }}
          >
            {copy.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
