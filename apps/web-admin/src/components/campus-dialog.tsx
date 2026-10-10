import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import {
  CAMPUS_ADDRESS_MAX,
  CAMPUS_NAME_MAX,
  createCampusSchema,
  type CampusSummary,
} from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateCampuses } from '../queries';

interface CampusInput {
  name: string;
  address: string | null;
}

function useSaveCampus(campus: CampusSummary | undefined, saved: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CampusInput) =>
      campus === undefined
        ? api.campuses.create({ body })
        : api.campuses.update({ params: { id: campus.id }, body }),
    onSuccess: async (saved_) => {
      await invalidateCampuses(queryClient);
      toast.success(
        campus === undefined
          ? `${saved_.name} campus created. You were added to it.`
          : 'Campus saved.'
      );
      saved();
    },
  });
}

function CampusFields({
  campus,
  nameError,
}: {
  campus: CampusSummary | undefined;
  nameError: string | undefined;
}) {
  return (
    <>
      <TextField
        label="Name"
        name="name"
        autoComplete="off"
        maxLength={CAMPUS_NAME_MAX}
        defaultValue={campus?.name ?? ''}
        aria-invalid={nameError === undefined ? undefined : true}
        required
      />
      <FieldError message={nameError} />
      <TextField
        label="Address"
        name="address"
        autoComplete="off"
        maxLength={CAMPUS_ADDRESS_MAX}
        defaultValue={campus?.address ?? ''}
      />
    </>
  );
}

function CampusForm({
  campus,
  onClose,
}: {
  campus: CampusSummary | undefined;
  onClose: () => void;
}) {
  const [nameError, setNameError] = useState<string | undefined>();
  const save = useSaveCampus(campus, onClose);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const address = fieldValue(data, 'address').trim();
    const parsed = createCampusSchema.safeParse({
      name: fieldValue(data, 'name'),
      address,
    });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message);
      return;
    }
    setNameError(undefined);
    save.mutate(
      { name: parsed.data.name, address: address === '' ? null : address },
      {
        onError: (error) => {
          setNameError(error.message);
        },
      }
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>
          {campus === undefined ? 'New campus' : `Edit ${campus.name}`}
        </DialogTitle>
        <DialogDescription>
          {campus === undefined
            ? 'Each campus has its own staff, classes and students. You are added to it.'
            : 'Change the campus name or address.'}
        </DialogDescription>
      </DialogHeader>
      <CampusFields campus={campus} nameError={nameError} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {campus === undefined ? <PlusIcon /> : null}
          {campus === undefined ? 'Create campus' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CampusDialog({
  campus,
  open,
  onOpenChange,
}: {
  campus?: CampusSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <CampusForm
          campus={campus}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
