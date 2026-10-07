import { useState, type SubmitEvent } from 'react';
import type { EduvaultAuthClient } from './auth-client';
import { Button, TextField, fieldValue } from '@eduvault/ui';

export function SignInForm({ authClient }: { authClient: EduvaultAuthClient }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = fieldValue(form, 'email');
    const password = fieldValue(form, 'password');
    setPending(true);
    setError(null);
    const result =
      mode === 'sign-in'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({
            email,
            password,
            name: fieldValue(form, 'name') || email,
          });
    setPending(false);
    if (result.error) setError(result.error.message ?? 'Something went wrong');
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">
        {mode === 'sign-in' ? 'Sign in' : 'Create an account'}
      </h1>
      {mode === 'sign-up' ? (
        <TextField label="Name" name="name" required />
      ) : null}
      <TextField label="Email" name="email" type="email" required />
      <TextField
        label="Password"
        name="password"
        type="password"
        minLength={8}
        required
      />
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {mode === 'sign-in' ? 'Sign in' : 'Sign up'}
      </Button>
      <button
        type="button"
        className="text-sm text-muted-foreground underline"
        onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
      >
        {mode === 'sign-in'
          ? 'No account? Sign up'
          : 'Have an account? Sign in'}
      </button>
    </form>
  );
}
