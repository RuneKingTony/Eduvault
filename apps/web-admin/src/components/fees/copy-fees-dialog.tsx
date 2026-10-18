import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, InfoIcon } from 'lucide-react';
import { feeTermLabel, type FeeCopyTerm } from '@eduvault/api-contract';
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
import { useApi } from '../../api';
import type { FeeTermOption } from '../../fee-terms';
import { invalidateFees } from '../../queries';
import { copiedFeesToast, copyFeesBody } from './fee-text';

function useCopy(sourceLabel: string, onOpenChange: (open: boolean) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (termId: string) => api.feeLines.copy({ body: { termId } }),
    onSuccess: async (result) => {
      await invalidateFees(queryClient);
      toast.success(copiedFeesToast(result.copied, sourceLabel));
      onOpenChange(false);
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

export function CopyFeesDialog({
  open,
  source,
  count,
  target,
  onOpenChange,
}: {
  open: boolean;
  source: FeeCopyTerm;
  count: number;
  target: Pick<FeeTermOption, 'id' | 'label'>;
  onOpenChange: (open: boolean) => void;
}) {
  const sourceLabel = feeTermLabel(source);
  const copy = useCopy(sourceLabel, onOpenChange);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy fees from {sourceLabel}?</DialogTitle>
          <DialogDescription>Into {target.label}.</DialogDescription>
        </DialogHeader>
        <p className="text-sm">{copyFeesBody(count, sourceLabel)}</p>
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Charges already sent don’t change.
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
            disabled={copy.isPending}
            onClick={() => {
              copy.mutate(target.id);
            }}
          >
            <CopyIcon />
            Copy fees
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
