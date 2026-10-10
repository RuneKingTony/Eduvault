import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRoundPlusIcon } from 'lucide-react';
import {
  ApiError,
  createMemberSchema,
  type Campus,
  type CreateMemberResult,
} from '@eduvault/api-contract';
import { meQueryOptions } from '@eduvault/auth-client';
import { toggled } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ErrorMessage,
  FieldError,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextField,
  fieldValue,
} from '@eduvault/ui';
import { useApi } from '../api';
import { campusesQueryOptions, invalidateMembers } from '../queries';
import { CampusToggleList } from './campus-toggle-list';

type FieldErrors = Partial<Record<string, string>>;

const TOO_LONG_MESSAGES: Record<string, string> = {
  name: 'Keep the name to 120 characters.',
  title: 'Keep the job title to 80 characters.',
};

function fieldErrorsOf(input: unknown): {
  errors: FieldErrors;
  data?: ReturnType<typeof createMemberSchema.parse>;
} {
  const parsed = createMemberSchema.safeParse(input);
  if (parsed.success) {
    return { errors: {}, data: parsed.data };
  }
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    const tooLong =
      issue.code === 'too_big' ? TOO_LONG_MESSAGES[key] : undefined;
    errors[key] ??= tooLong ?? issue.message;
  }
  return { errors };
}

function CampusChoices({
  campuses,
  picked,
  onToggle,
}: {
  campuses: readonly Campus[];
  picked: readonly string[];
  onToggle: (campusId: string, on: boolean) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Campuses</legend>
      <CampusToggleList
        campuses={campuses}
        picked={picked}
        onToggle={onToggle}
        control="checkbox"
        idPrefix="add-campus"
        showAddress
      />
      <p className="text-xs text-muted-foreground">
        They only see these campuses, unless a role lets them see every campus.
      </p>
    </fieldset>
  );
}

function useAddMember(onAdded: (result: CreateMemberResult) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.members.create>[0]['body']) =>
      api.members.create({ body }),
    onSuccess: async (result) => {
      await invalidateMembers(queryClient, false);
      onAdded(result);
    },
  });
}

function useAddMemberForm(onAdded: (result: CreateMemberResult) => void) {
  const api = useApi();
  const campuses = useQuery(campusesQueryOptions(api));
  const me = useQuery(meQueryOptions(api));
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const add = useAddMember(onAdded);
  const active = me.data?.activeCampusId ?? null;
  const picked = chosen ?? (active === null ? [] : [active]);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = fieldErrorsOf({
      name: fieldValue(data, 'name'),
      email: fieldValue(data, 'email'),
      title: fieldValue(data, 'title'),
      campusIds: picked,
    });
    setErrors(result.errors);
    if (result.data !== undefined) {
      add.mutate(result.data);
    }
  }

  return {
    list: campuses.data ?? [],
    noCampuses: campuses.isSuccess && campuses.data.length === 0,
    picked,
    errors,
    add,
    submit,
    toggle: (campusId: string, on: boolean) => {
      setChosen(toggled(picked, campusId, on));
    },
  };
}

function AddMemberFields({
  form,
  duplicate,
  onOpenCampuses,
}: {
  form: ReturnType<typeof useAddMemberForm>;
  duplicate: string | undefined;
  onOpenCampuses: () => void;
}) {
  const { errors } = form;
  return (
    <>
      <TextField label="Full name" name="name" autoComplete="off" />
      <FieldError message={errors['name']} />
      <TextField label="Email" name="email" type="email" />
      <FieldError message={errors['email'] ?? duplicate} />
      <TextField label="Job title" name="title" />
      <FieldError message={errors['title']} />
      {form.noCampuses ? (
        <Alert>
          <AlertTitle>Add a campus first</AlertTitle>
          <AlertDescription>
            Every member belongs to at least one campus.
            <Button type="button" variant="link" onClick={onOpenCampuses}>
              Go to Campuses
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <CampusChoices
          campuses={form.list}
          picked={form.picked}
          onToggle={form.toggle}
        />
      )}
      <FieldError message={errors['campusIds']} />
    </>
  );
}

function AddMemberBody({
  onClose,
  onAdded,
  onOpenCampuses,
}: {
  onClose: () => void;
  onAdded: (result: CreateMemberResult) => void;
  onOpenCampuses: () => void;
}) {
  const form = useAddMemberForm(onAdded);
  const { add } = form;
  const duplicate =
    add.error instanceof ApiError && add.error.status === 409
      ? add.error.message
      : undefined;

  return (
    <>
      <SheetHeader>
        <SheetTitle>Add a member</SheetTitle>
        <SheetDescription>
          They start as a plain member with no permissions. Add roles on their
          page.
        </SheetDescription>
      </SheetHeader>
      <form
        id="add-member"
        onSubmit={form.submit}
        noValidate
        className="flex flex-col gap-3 px-4"
      >
        <AddMemberFields
          form={form}
          duplicate={duplicate}
          onOpenCampuses={onOpenCampuses}
        />
        <ErrorMessage error={duplicate === undefined ? add.error : null} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="add-member"
          disabled={add.isPending || form.noCampuses}
        >
          <UserRoundPlusIcon />
          Create account
        </Button>
      </SheetFooter>
    </>
  );
}

export function AddMemberSheet({
  open,
  onOpenChange,
  onAdded,
  onOpenCampuses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (result: CreateMemberResult) => void;
  onOpenCampuses: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <AddMemberBody
          onClose={() => {
            onOpenChange(false);
          }}
          onAdded={onAdded}
          onOpenCampuses={onOpenCampuses}
        />
      </SheetContent>
    </Sheet>
  );
}
