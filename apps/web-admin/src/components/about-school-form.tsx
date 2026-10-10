import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import {
  denialMessage,
  updateSchoolProfileSchema,
  type SchoolProfile,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { Button, FieldError, TextField, fieldValue, toast } from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateSchool } from '../queries';
import { SettingsSection } from './settings-page';

const FIELDS = ['name', 'address', 'city', 'phone', 'email'] as const;
type Field = (typeof FIELDS)[number];
type Errors = Partial<Record<Field, string>>;

const DENIED = 'You need permission to change school settings.';

function useSaveProfile() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Parameters<typeof api.schoolAccount.update>[0]['body']
    ) => api.schoolAccount.update({ body }),
    onSuccess: async () => {
      await invalidateSchool(queryClient);
      toast.success('School profile saved.');
    },
    onError: (error) => {
      toast.error(denialMessage(error, DENIED));
    },
  });
}

function ProfileFields({
  profile,
  errors,
}: {
  profile: SchoolProfile;
  errors: Errors;
}) {
  return (
    <>
      <TextField
        label="School name"
        name="name"
        defaultValue={profile.name}
        aria-invalid={errors.name === undefined ? undefined : true}
        required
      />
      <FieldError message={errors.name} />
      <TextField
        label="Address"
        name="address"
        autoComplete="street-address"
        defaultValue={profile.address ?? ''}
      />
      <FieldError message={errors.address} />
      <TextField
        label="City"
        name="city"
        autoComplete="address-level2"
        defaultValue={profile.city ?? ''}
      />
      <FieldError message={errors.city} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={profile.phone ?? ''}
          />
          <FieldError message={errors.phone} />
        </div>
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={profile.email ?? ''}
            aria-invalid={errors.email === undefined ? undefined : true}
          />
          <FieldError message={errors.email} />
        </div>
      </div>
    </>
  );
}

export function AboutSchoolForm({ profile }: { profile: SchoolProfile }) {
  const canEdit = useCan('schoolAccount', 'update');
  const [errors, setErrors] = useState<Errors>({});
  const save = useSaveProfile();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = updateSchoolProfileSchema.safeParse(
      Object.fromEntries(FIELDS.map((name) => [name, fieldValue(data, name)]))
    );
    if (parsed.success) {
      setErrors({});
      save.mutate(parsed.data);
      return;
    }
    setErrors(
      Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path[0], issue.message])
      ) as Errors
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <SettingsSection
        title="About the school"
        description="Parents see these details on receipts and in the portal."
        footer={
          canEdit ? (
            <Button type="submit" disabled={save.isPending}>
              <CheckIcon />
              Save changes
            </Button>
          ) : undefined
        }
      >
        <fieldset disabled={!canEdit} className="flex flex-col gap-4">
          <ProfileFields profile={profile} errors={errors} />
        </fieldset>
      </SettingsSection>
    </form>
  );
}
