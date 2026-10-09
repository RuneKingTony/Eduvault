import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import {
  ADMISSION_PREFIX_MAX_LENGTH,
  createSchoolSchema,
  type CreateSchoolResult,
} from '@eduvault/api-contract';
import {
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextField,
  fieldValue,
  ErrorMessage,
  FieldError,
} from '@eduvault/ui';
import { useApi } from '../api';
import { PLATFORM_SCHOOLS_KEY } from '../queries';
import { suggestPrefix, suggestSlug } from '../platform-suggestions';

const FIELD_MESSAGES: Record<string, string> = {
  name: 'Enter the school name, 2 to 120 characters.',
  slug: 'Use lowercase letters, numbers and hyphens.',
  admissionPrefix: `Use 2 to ${ADMISSION_PREFIX_MAX_LENGTH} capital letters.`,
  ownerName: 'Enter the owner’s name.',
  ownerEmail: 'Enter a valid email.',
};

type FieldErrors = Partial<Record<string, string>>;

function useSchoolFields() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [prefix, setPrefix] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [prefixEdited, setPrefixEdited] = useState(false);
  return {
    name,
    slug,
    prefix,
    onName: (value: string) => {
      setName(value);
      if (!slugEdited) {
        setSlug(suggestSlug(value));
      }
      if (!prefixEdited) {
        setPrefix(suggestPrefix(value));
      }
    },
    onSlug: (value: string) => {
      setSlugEdited(true);
      setSlug(value);
    },
    onPrefix: (value: string) => {
      setPrefixEdited(true);
      setPrefix(value);
    },
  };
}

function fieldErrorsOf(input: unknown): FieldErrors {
  const parsed = createSchoolSchema.safeParse(input);
  if (parsed.success) {
    return {};
  }
  return Object.fromEntries(
    parsed.error.issues.map((issue) => {
      const key = String(issue.path[0]);
      return [key, FIELD_MESSAGES[key] ?? issue.message];
    })
  );
}

function useCreateSchool(onCreated: (result: CreateSchoolResult) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Parameters<typeof api.platform.schools.create>[0]['body']
    ) => api.platform.schools.create({ body }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: PLATFORM_SCHOOLS_KEY });
      onCreated(result);
    },
  });
}

function useSchoolForm(create: ReturnType<typeof useCreateSchool>) {
  const fields = useSchoolFields();
  const [errors, setErrors] = useState<FieldErrors>({});

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const city = fieldValue(data, 'city').trim();
    const input = {
      name: fields.name.trim(),
      slug: fields.slug,
      admissionPrefix: fields.prefix,
      ...(city === '' ? {} : { city }),
      ownerName: fieldValue(data, 'ownerName'),
      ownerEmail: fieldValue(data, 'ownerEmail').trim(),
    };
    const problems = fieldErrorsOf(input);
    setErrors(problems);
    if (Object.keys(problems).length === 0) {
      create.mutate(input);
    }
  }

  return { fields, errors, submit };
}

export function CreateSchoolSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateSchoolResult) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <CreateSchoolBody
          onClose={() => {
            onOpenChange(false);
          }}
          onCreated={onCreated}
        />
      </SheetContent>
    </Sheet>
  );
}

function CreateSchoolBody({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: CreateSchoolResult) => void;
}) {
  const create = useCreateSchool((result) => {
    onClose();
    onCreated(result);
  });
  const { fields, errors, submit } = useSchoolForm(create);

  return (
    <>
      <SheetHeader>
        <SheetTitle>Create a school</SheetTitle>
        <SheetDescription>
          The school, its owner and six starter roles are created in one step.
        </SheetDescription>
      </SheetHeader>
      <form
        id="create-school"
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-3 px-4"
      >
        <SchoolFields fields={fields} errors={errors} />
        <Separator />
        <TextField label="Owner name" name="ownerName" />
        <FieldError message={errors['ownerName']} />
        <TextField label="Owner email" name="ownerEmail" type="email" />
        <FieldError message={errors['ownerEmail']} />
        <ErrorMessage error={create.error} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="create-school" disabled={create.isPending}>
          <PlusIcon />
          Create school
        </Button>
      </SheetFooter>
    </>
  );
}

function SchoolFields({
  fields,
  errors,
}: {
  fields: ReturnType<typeof useSchoolFields>;
  errors: FieldErrors;
}) {
  return (
    <>
      <TextField
        label="School name"
        name="name"
        value={fields.name}
        onChange={(event) => {
          fields.onName(event.target.value);
        }}
      />
      <FieldError message={errors['name']} />
      <TextField
        label="Slug"
        name="slug"
        className="font-mono"
        value={fields.slug}
        onChange={(event) => {
          fields.onSlug(event.target.value);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Fixed in practice: student usernames are slug + admission number.
      </p>
      <FieldError message={errors['slug']} />
      <TextField label="City" name="city" />
      <TextField
        label="Admission prefix"
        name="admissionPrefix"
        className="font-mono"
        value={fields.prefix}
        onChange={(event) => {
          fields.onPrefix(event.target.value);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Starts every admission number, for example GF-0123.
      </p>
      <FieldError message={errors['admissionPrefix']} />
    </>
  );
}
