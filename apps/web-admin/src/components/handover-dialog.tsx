import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
import { denialMessage, type HandoverCandidate } from '@eduvault/api-contract';
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
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { ME_PERMISSIONS_KEY, invalidateSchool } from '../queries';

const DENIED = 'You need permission to hand over the school.';

const roleName = (slug: string) =>
  `${slug.slice(0, 1).toUpperCase()}${slug.slice(1)}`;

const joined = (names: readonly string[]) => names.join(' and ');

function useHandover(
  candidate: HandoverCandidate,
  { done, handedOver }: { done: () => void; handedOver: () => void }
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.school.handover({ body: { userId: candidate.userId } }),
    onSuccess: async () => {
      done();
      toast.success(
        `Ownership handed to ${candidate.name}. You are now a member.`
      );
      await Promise.all([
        invalidateSchool(queryClient),
        queryClient.invalidateQueries({ queryKey: ME_PERMISSIONS_KEY }),
      ]);
      handedOver();
    },
    onError: (error) => {
      toast.error(denialMessage(error, DENIED));
    },
  });
}

function HandoverBullets({ candidate }: { candidate: HandoverCandidate }) {
  const lost = candidate.heldSenior.map((slug) => roleName(slug));
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
      <li>
        <strong>{candidate.name}</strong> becomes an owner and can do everything
        {lost.length === 0 ? '.' : `, and stops being ${joined(lost)}.`}
      </li>
      <li>You stay on the staff list, but you are no longer an owner.</li>
      <li>Only an owner can hand it back.</li>
    </ul>
  );
}

export function HandoverDialog({
  candidate,
  open,
  onOpenChange,
  onHandedOver,
}: {
  candidate: HandoverCandidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHandedOver: () => void;
}) {
  const handover = useHandover(candidate, {
    done: () => {
      onOpenChange(false);
    },
    handedOver: onHandedOver,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand the school to {candidate.name}?</DialogTitle>
          <DialogDescription>
            This changes who owns the school.
          </DialogDescription>
        </DialogHeader>
        <HandoverBullets candidate={candidate} />
        <Alert>
          <InfoIcon />
          <AlertDescription>
            You will lose access to this page as soon as you confirm.
          </AlertDescription>
        </Alert>
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
            variant="destructive"
            disabled={handover.isPending}
            onClick={() => {
              handover.mutate();
            }}
          >
            Hand over the school
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
