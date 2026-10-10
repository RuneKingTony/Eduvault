import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InfoIcon, Trash2Icon } from 'lucide-react';
import type { SchoolYear } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { fmtDateRange } from '@eduvault/shared';
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
import { invalidateCalendar } from '../../queries';

function useDeleteYear(year: SchoolYear, done: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.schoolYears.remove({ params: { id: year.id } }),
    onSuccess: async () => {
      await invalidateCalendar(queryClient);
      toast.success(`${year.name} deleted.`);
      done();
    },
    onError: async (error) => {
      await invalidateCalendar(queryClient);
      toast.error(error.message);
      done();
    },
  });
}

function DeleteYearBody() {
  return (
    <>
      <p className="text-sm">
        This removes the school year, its three terms and any holidays in them.
        It cannot be undone.
      </p>
      <Alert>
        <InfoIcon />
        <AlertDescription>
          It has no students, charges or payments, so nothing else is affected.
        </AlertDescription>
      </Alert>
    </>
  );
}

export function DeleteYearDialog({
  year,
  onOpenChange,
}: {
  year: SchoolYear;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteYear(year, () => {
    onOpenChange(false);
  });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2Icon className="size-4" />
            Delete {year.name}?
          </DialogTitle>
          <DialogDescription>
            {fmtDateRange(year.startsOn, year.endsOn)}
          </DialogDescription>
        </DialogHeader>
        <DeleteYearBody />
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
          <Can permission="session:update">
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate();
              }}
            >
              <Trash2Icon />
              Delete school year
            </Button>
          </Can>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
