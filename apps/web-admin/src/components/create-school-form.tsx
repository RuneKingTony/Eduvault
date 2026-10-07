import { useState, type FormEvent } from 'react';
import { slugify } from '@eduvault/shared';
import { Button, TextField, type EduvaultAuthClient } from '@eduvault/ui';

export function CreateSchoolForm({
  authClient,
  onCreated,
}: {
  authClient: EduvaultAuthClient;
  onCreated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '');
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
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
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <Button type="submit">Create school</Button>
    </form>
  );
}
