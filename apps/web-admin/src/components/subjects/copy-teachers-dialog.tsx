import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import {
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
import { invalidateSubjectTeachers } from '../../queries';
import { copiedMessage } from './subject-model';

export function CopyTeachersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const copy = useMutation({
    mutationFn: () => api.subjectTeachers.copyFromPreviousTerm({}),
    onSuccess: async (result) => {
      await invalidateSubjectTeachers(queryClient);
      toast.success(
        copiedMessage(result.copied, result.skipped.length, result.from.name)
      );
      onOpenChange(false);
    },
    onError: (failure) => {
      toast.error(failure.message);
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy last term’s subject teachers?</DialogTitle>
          <DialogDescription>
            Only subjects with no teacher this term are filled. Subjects no
            longer on the level, and teachers who can no longer teach on that
            campus, are skipped.
          </DialogDescription>
        </DialogHeader>
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
              copy.mutate();
            }}
          >
            <CopyIcon />
            Copy teachers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
