import { useState } from 'react';
import type { CreateSchoolResult } from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@eduvault/ui';

function PasswordBlock({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <dl className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex flex-col">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{email}</dd>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Temporary password</dt>
          <dd className="font-mono text-base">{password}</dd>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(password).then(
              () => {
                setCopy('copied');
              },
              () => {
                setCopy('failed');
              }
            );
          }}
        >
          {copy === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {copy === 'failed' ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t copy. Select the password and copy it by hand.
        </p>
      ) : null}
    </dl>
  );
}

/** The one place a temporary password is shown; only Done closes it. */
export function TemporaryPasswordDialog({
  open,
  title,
  description,
  email,
  password,
  onDone,
}: {
  open: boolean;
  title: string;
  description: string;
  email: string;
  password: string | null;
  onDone: () => void;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {password === null ? null : (
          <PasswordBlock email={email} password={password} />
        )}
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreatedSchoolDialog({
  result,
  onDone,
}: {
  result: CreateSchoolResult | null;
  onDone: () => void;
}) {
  const password = result?.temporaryPassword ?? null;
  return (
    <TemporaryPasswordDialog
      open={result !== null}
      title={`${result?.school.name ?? ''} created`}
      description={
        password === null
          ? `${result?.owner.email ?? ''} already has an account and is now the owner.`
          : 'Give the owner this temporary password. They choose their own at first sign-in. It won’t be shown again.'
      }
      email={result?.owner.email ?? ''}
      password={password}
      onDone={onDone}
    />
  );
}
