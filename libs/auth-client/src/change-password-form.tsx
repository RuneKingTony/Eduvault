import { useState, type SubmitEvent } from 'react';
import { ApiError, PASSWORD_MIN_LENGTH } from '@eduvault/api-contract';
import {
  Button,
  ErrorMessage,
  FieldError,
  TextField,
  fieldValue,
} from '@eduvault/ui';
import { AuthCard, type AuthVariant } from './auth-card';

interface FieldErrors {
  newPassword?: string;
  confirm?: string;
}

function validate(newPassword: string, confirm: string): FieldErrors {
  const tooShort = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  return {
    ...(newPassword.length < PASSWORD_MIN_LENGTH
      ? { newPassword: tooShort }
      : {}),
    ...(newPassword === confirm
      ? {}
      : { confirm: 'The passwords don’t match.' }),
  };
}

function serverMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const issue = error.body.issues?.find(
      (candidate) => candidate.path === 'newPassword'
    );
    return issue?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}

function useChangePassword(onSubmit: (newPassword: string) => Promise<void>) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<Error | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = fieldValue(form, 'newPassword');
    const problems = validate(newPassword, fieldValue(form, 'confirm'));
    setFieldErrors(problems);
    setError(null);
    if (Object.keys(problems).length > 0) {
      return;
    }
    setPending(true);
    try {
      await onSubmit(newPassword);
    } catch (error_) {
      setError(new Error(serverMessage(error_)));
    } finally {
      setPending(false);
    }
  }

  return { fieldErrors, error, pending, submit };
}

export function ChangePasswordForm({
  onSubmit,
  onSignOut,
  variant = 'staff',
}: {
  onSubmit: (newPassword: string) => Promise<void>;
  onSignOut: () => void;
  variant?: AuthVariant;
}) {
  const { fieldErrors, error, pending, submit } = useChangePassword(onSubmit);

  return (
    <AuthCard variant={variant}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Choose your own password</h1>
          <p className="text-sm text-muted-foreground">
            You signed in with a temporary password
          </p>
        </div>
        <TextField
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          At least {PASSWORD_MIN_LENGTH} characters.
        </p>
        <FieldError message={fieldErrors.newPassword} />
        <TextField
          label="Confirm new password"
          name="confirm"
          type="password"
          autoComplete="new-password"
        />
        <FieldError message={fieldErrors.confirm} />
        <ErrorMessage error={error} />
        <Button type="submit" size="lg" disabled={pending}>
          Save and continue
        </Button>
      </form>
      <Button
        type="button"
        variant="link"
        className="self-start px-0"
        onClick={onSignOut}
      >
        Sign out
      </Button>
    </AuthCard>
  );
}
