import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon } from 'lucide-react';
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  editGuardianSchema,
  type GuardianDetail,
  type LoginCredential,
} from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  FieldError,
  Skeleton,
  TextField,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { guardianQueryOptions, invalidateStudents } from '../queries';
import type { GuardianAction } from './guardian-actions';
import { PhotoField, type PhotoValue } from './photo-field';
import { PaysFeesBadge, PersonAvatar } from './student-bits';

function ProfileRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function ProfileBody({ guardian }: { guardian: GuardianDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <PersonAvatar
          name={guardian.fullName}
          photoUrl={guardian.photoUrl}
          className="size-14"
        />
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">{guardian.fullName}</h3>
          <div className="flex flex-wrap gap-1">
            <Badge variant="success">
              {guardian.email === null ? 'Username login' : 'Email login'}
            </Badge>
            {guardian.paysFees ? <PaysFeesBadge /> : null}
          </div>
        </div>
      </div>
      <dl className="flex flex-col gap-3">
        <ProfileRow label="Phone">{guardian.phone}</ProfileRow>
        <ProfileRow label="Email">
          {guardian.email ?? (
            <span className="text-muted-foreground">
              None on file. Signs in with username{' '}
              <code className="font-mono">{guardian.username}</code>.
            </span>
          )}
        </ProfileRow>
        <ProfileRow label="House address">
          {guardian.address ?? (
            <span className="text-muted-foreground">Not recorded</span>
          )}
        </ProfileRow>
        <ProfileRow label="Children">
          {guardian.children.length === 0 ? (
            <span className="text-muted-foreground">None in your scope</span>
          ) : (
            <ul>
              {guardian.children.map((child) => (
                <li key={child.studentId}>
                  {child.name} ·{' '}
                  {GUARDIAN_RELATIONSHIP_LABELS[child.relationship]}
                </li>
              ))}
            </ul>
          )}
        </ProfileRow>
      </dl>
    </div>
  );
}

function ProfileActions({
  guardian,
  onAction,
}: {
  guardian: GuardianDetail;
  onAction: (action: GuardianAction | null) => void;
}) {
  return (
    <Can permission="guardian:update">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onAction({ kind: 'edit-details', guardian });
        }}
      >
        Edit details
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onAction({ kind: 'reset-login', guardian });
        }}
      >
        <KeyRoundIcon />
        Reset login
      </Button>
    </Can>
  );
}

export function GuardianProfileDialog({
  guardianId,
  onAction,
}: {
  guardianId: string;
  onAction: (action: GuardianAction | null) => void;
}) {
  const api = useApi();
  const guardian = useQuery(guardianQueryOptions(api, guardianId));
  const close = () => {
    onAction(null);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent>
        <DialogHeader className="sr-only">
          <DialogTitle>Guardian</DialogTitle>
          <DialogDescription>About this guardian.</DialogDescription>
        </DialogHeader>
        {guardian.data === undefined ? (
          <>
            <Skeleton className="h-24 w-full" />
            <ErrorMessage error={guardian.error} />
          </>
        ) : (
          <ProfileBody guardian={guardian.data} />
        )}
        <DialogFooter>
          {guardian.data === undefined ? null : (
            <ProfileActions guardian={guardian.data} onAction={onAction} />
          )}
          <Button type="button" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Fields = 'fullName' | 'phone' | 'address';

function useEditGuardian(guardian: GuardianDetail, onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.guardians.update>[0]['body']) =>
      api.guardians.update({ params: { id: guardian.id }, body }),
    onSuccess: async () => {
      await invalidateStudents(queryClient);
      toast.success('Saved.');
      onClose();
    },
  });
}

function fieldErrorsOf(
  issues: readonly { path: PropertyKey[]; message: string }[]
): Partial<Record<Fields, string>> {
  const found: Partial<Record<Fields, string>> = {};
  for (const issue of issues) {
    const key = String(issue.path[0]);
    if (key === 'fullName' || key === 'phone' || key === 'address') {
      found[key] ??= issue.message;
    }
  }
  return found;
}

function useEditForm(guardian: GuardianDetail, onClose: () => void) {
  const [values, setValues] = useState<Record<Fields, string>>({
    fullName: guardian.fullName,
    phone: guardian.phone,
    address: guardian.address ?? '',
  });
  const [photo, setPhoto] = useState<PhotoValue | undefined>();
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const save = useEditGuardian(guardian, onClose);

  function submit() {
    const parsed = editGuardianSchema.safeParse({
      ...values,
      ...(photo === undefined ? {} : { photoFileId: photo.fileId }),
    });
    if (parsed.success) {
      setErrors({});
      save.mutate(parsed.data);
    } else {
      setErrors(fieldErrorsOf(parsed.error.issues));
    }
  }

  return { values, setValues, photo, setPhoto, errors, save, submit };
}

const FIELD_LABELS: Record<Fields, string> = {
  fullName: 'Full name',
  phone: 'Phone',
  address: 'House address',
};

function EditFields({ form }: { form: ReturnType<typeof useEditForm> }) {
  return (
    <>
      {(['fullName', 'phone', 'address'] as const).map((key) => (
        <div key={key} className="flex flex-col gap-1">
          <TextField
            label={FIELD_LABELS[key]}
            value={form.values[key]}
            onChange={(event) => {
              form.setValues({ ...form.values, [key]: event.target.value });
            }}
          />
          <FieldError message={form.errors[key]} />
        </div>
      ))}
      <PhotoField
        name={form.values.fullName}
        value={form.photo ?? { fileId: null, preview: null }}
        onChange={form.setPhoto}
      />
    </>
  );
}

export function EditGuardianDialog({
  guardian,
  onClose,
}: {
  guardian: GuardianDetail;
  onClose: () => void;
}) {
  const form = useEditForm(guardian, onClose);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {guardian.fullName}’s details</DialogTitle>
          <DialogDescription>
            Email and username are not editable here.
          </DialogDescription>
        </DialogHeader>
        <EditFields form={form} />
        <ErrorMessage error={form.save.error} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={form.save.isPending}
            onClick={form.submit}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function credentialOf(
  guardian: GuardianDetail,
  result: { username?: string; email?: string; temporaryPassword: string }
): LoginCredential {
  return {
    who: 'guardian',
    name: guardian.fullName,
    guardianId: guardian.id,
    existing: false,
    temporaryPassword: result.temporaryPassword,
    ...(result.username === undefined ? {} : { username: result.username }),
    ...(result.email === undefined ? {} : { email: result.email }),
  };
}

function ResetFooter({
  busy,
  onCancel,
  onReset,
}: {
  busy: boolean;
  onCancel: () => void;
  onReset: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" disabled={busy} onClick={onReset}>
        Reset login
      </Button>
    </DialogFooter>
  );
}

export function ResetLoginDialog({
  guardian,
  onClose,
  onIssued,
}: {
  guardian: GuardianDetail;
  onClose: () => void;
  onIssued: (logins: LoginCredential[]) => void;
}) {
  const api = useApi();
  const reset = useMutation({
    mutationFn: () => api.guardians.resetLogin({ params: { id: guardian.id } }),
    onSuccess: (result) => {
      onClose();
      onIssued([credentialOf(guardian, result)]);
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon />
            Reset {guardian.fullName}’s login?
          </DialogTitle>
          <DialogDescription>
            They get a new temporary password and must choose their own the next
            time they sign in. The old password stops working at once.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {guardian.email === null
            ? `Username ${guardian.username ?? ''}.`
            : `Signs in with ${guardian.email}.`}
        </p>
        <ErrorMessage error={reset.error} />
        <ResetFooter
          busy={reset.isPending}
          onCancel={onClose}
          onReset={() => {
            reset.mutate();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
