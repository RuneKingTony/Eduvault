import { useState, type SubmitEvent } from 'react';
import {
  BANNED_USER_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
} from '@eduvault/api-contract';
import { Button, TextField, fieldValue, FieldError } from '@eduvault/ui';
import type { EduvaultAuthClient } from './auth-client';
import { AuthCard, type AuthVariant } from './auth-card';

const HEADINGS: Record<AuthVariant, { heading: string; intro?: string }> = {
  staff: {
    heading: 'Welcome back',
    intro: 'Sign in with the email your school added.',
  },
  portal: { heading: 'Sign in' },
};

interface SignInFailure {
  status?: number;
  code?: string;
}

export function signInErrorMessage({ status, code }: SignInFailure): string {
  if (status === 429) {
    return TOO_MANY_ATTEMPTS_MESSAGE;
  }
  if (code === 'BANNED_USER') {
    return BANNED_USER_MESSAGE;
  }
  return 'That email and password don’t match.';
}

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  return {
    ...(email === '' ? { email: 'Enter your email.' } : {}),
    ...(password === '' ? { password: 'Enter your password.' } : {}),
  };
}

function useSignIn(authClient: EduvaultAuthClient) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = fieldValue(form, 'email').trim();
    const password = fieldValue(form, 'password');
    const problems = validate(email, password);
    setFieldErrors(problems);
    setError(null);
    if (Object.keys(problems).length > 0) {
      return;
    }
    setPending(true);
    const result = await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(signInErrorMessage(result.error));
    }
  }

  return { fieldErrors, error, pending, submit };
}

export function SignInForm({
  authClient,
  variant = 'staff',
}: {
  authClient: EduvaultAuthClient;
  variant?: AuthVariant;
}) {
  const { fieldErrors, error, pending, submit } = useSignIn(authClient);
  const { heading, intro } = HEADINGS[variant];

  return (
    <AuthCard variant={variant}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{heading}</h1>
          {intro === undefined ? null : (
            <p className="text-sm text-muted-foreground">{intro}</p>
          )}
        </div>
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          aria-invalid={fieldErrors.email === undefined ? undefined : true}
        />
        <FieldError message={fieldErrors.email} />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={fieldErrors.password === undefined ? undefined : true}
        />
        <FieldError message={fieldErrors.password} />
        <FieldError message={error} />
        <Button type="submit" size="lg" disabled={pending}>
          Sign in
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Forgot your password? Ask your school owner to reset it.
      </p>
    </AuthCard>
  );
}
