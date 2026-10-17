import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Item } from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateStore } from '../../queries';
import { itemRetiredMessage } from './store-text';

function useRetire(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Item) =>
      api.store.updateItem({
        params: { id: item.id },
        body: { retired: true },
      }),
    onSuccess: async (retired) => {
      await invalidateStore(queryClient);
      toast.success(itemRetiredMessage(retired.displayName));
      onClose();
    },
  });
}

export function RetireItemDialog({
  item,
  onClose,
}: {
  item: Item | null;
  onClose: () => void;
}) {
  const retire = useRetire(onClose);
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          retire.reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retire {item?.displayName}?</DialogTitle>
          <DialogDescription>
            It is no longer offered for deliveries, sales or counts. Past
            records keep it.
          </DialogDescription>
        </DialogHeader>
        <ErrorMessage error={retire.error} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={retire.isPending || item === null}
            onClick={() => {
              if (item !== null) {
                retire.mutate(item);
              }
            }}
          >
            Retire item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
