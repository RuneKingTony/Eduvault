import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import {
  CLASS_NAME_MAX,
  createClassSchema,
  type ClassLevel,
  type Campus,
} from '@eduvault/api-contract';
import { meQueryOptions } from '@eduvault/auth-client';
import {
  Button,
  FieldError,
  NativeSelectOption,
  SelectField,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  campusesQueryOptions,
  classLevelsQueryOptions,
  invalidateClasses,
} from '../queries';

function useCreateClass(created: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { levelId: string; campusId: string; name: string }) =>
      api.classes.create({ body }),
    onSuccess: async (row) => {
      await invalidateClasses(queryClient);
      toast.success(`${row.displayName} created on ${row.campus.name}.`);
      created();
    },
  });
}

function PickField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: readonly { id: string; name: string }[];
}) {
  return (
    <SelectField label={label} name={name} defaultValue={defaultValue}>
      {options.map((option) => (
        <NativeSelectOption key={option.id} value={option.id}>
          {option.name}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function useNewClassForm(onClose: () => void) {
  const [error, setError] = useState<string | undefined>();
  const create = useCreateClass(onClose);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = createClassSchema.safeParse({
      levelId: fieldValue(data, 'levelId'),
      campusId: fieldValue(data, 'campusId'),
      name: fieldValue(data, 'name'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    create.mutate(parsed.data, {
      onError: (failure) => {
        setError(failure.message);
      },
    });
  }

  return { error, submit };
}

function NewClassForm({
  levels,
  campuses,
  activeCampusId,
  onClose,
}: {
  levels: readonly ClassLevel[];
  campuses: readonly Campus[];
  activeCampusId: string | null;
  onClose: () => void;
}) {
  const form = useNewClassForm(onClose);
  const campusId =
    campuses.find((campus) => campus.id === activeCampusId)?.id ??
    campuses[0]?.id ??
    '';
  return (
    <form
      id="new-class"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-3 px-4"
    >
      <PickField
        label="Level"
        name="levelId"
        defaultValue={levels[0]?.id ?? ''}
        options={levels}
      />
      <PickField
        label="Campus"
        name="campusId"
        defaultValue={campusId}
        options={campuses}
      />
      <TextField
        label="Name"
        name="name"
        autoComplete="off"
        maxLength={CLASS_NAME_MAX}
        placeholder="Gold"
        required
      />
      <FieldError message={form.error} />
    </form>
  );
}

function NewClassBody({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const levels = useQuery(classLevelsQueryOptions(api));
  const campuses = useQuery(campusesQueryOptions(api));
  const me = useQuery(meQueryOptions(api));
  const ready = levels.data !== undefined && campuses.data !== undefined;
  return (
    <>
      <SheetHeader>
        <SheetTitle>New class</SheetTitle>
        <SheetDescription>
          Classes belong to a campus and carry over each school year.
        </SheetDescription>
      </SheetHeader>
      {ready ? (
        <NewClassForm
          levels={levels.data}
          campuses={campuses.data}
          activeCampusId={me.data?.activeCampusId ?? null}
          onClose={onClose}
        />
      ) : null}
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="new-class" disabled={!ready}>
          <PlusIcon />
          Create class
        </Button>
      </SheetFooter>
    </>
  );
}

export function NewClassSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <NewClassBody
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
