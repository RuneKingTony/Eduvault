import { useState, type SubmitEvent } from 'react';
import { slugify } from '@eduvault/shared';
import type { EduvaultAuthClient } from '@eduvault/auth-client';
import { Button, TextField, fieldValue } from '@eduvault/ui';

export function CreateSchoolForm({
  authClient,
  onCreated,
}: {
  authClient: EduvaultAuthClient;
  onCreated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = fieldValue(new FormData(event.currentTarget), 'name');
    const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`;
    const result = await authClient.organization.create({ name, slug });
    if (result.error) {
      setError(result.error.message ?? 'Could not create the school');
      return;
    }
    onCreated();
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">Create your school</h1>
      <TextField label="School name" name="name" required />
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit">Create school</Button>
    </form>
  );
}
