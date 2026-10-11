import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GUARDIAN_RELATIONSHIPS,
  GUARDIAN_RELATIONSHIP_LABELS,
  type GuardianSummary,
} from '@eduvault/api-contract';
import {
  Alert,
  AlertDescription,
  Checkbox,
  FieldError,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  SelectField,
  Skeleton,
  TextField,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  usernamePreview,
  type DraftErrors,
  type GuardianDraftState,
  type GuardianMode,
} from '../guardian-draft';
import { guardiansQueryOptions } from '../queries';
import { PhotoField } from './photo-field';

interface PickerProps {
  idPrefix: string;
  draft: GuardianDraftState;
  onChange: (patch: Partial<GuardianDraftState>) => void;
  studentId?: string;
  takenIds: readonly string[];
  canCreate: boolean;
  errors: DraftErrors;
}

const LOOKUP_MIN = 4;

export const optionLabel = (guardian: GuardianSummary): string => {
  if (guardian.outsideScope) {
    return `${guardian.fullName} (another campus)`;
  }
  const children = guardian.childFirstNames ?? [];
  return [
    guardian.fullName,
    guardian.phone,
    ...(children.length === 0 ? [] : [children.join(', ')]),
  ]
    .filter((part): part is string => part !== undefined)
    .join(' · ');
};

function useGuardianOptions(
  studentId: string | undefined,
  lookup: string
): { options: GuardianSummary[]; pending: boolean } {
  const api = useApi();
  const visible = useQuery(
    guardiansQueryOptions(api, { excludeStudentId: studentId })
  );
  const found = useQuery({
    ...guardiansQueryOptions(api, { q: lookup, excludeStudentId: studentId }),
    enabled: lookup.length >= LOOKUP_MIN,
  });
  const seen = new Set<string>();
  const options = [...(visible.data ?? []), ...(found.data ?? [])].filter(
    (guardian) => {
      const fresh = !seen.has(guardian.id);
      seen.add(guardian.id);
      return fresh;
    }
  );
  return { options, pending: visible.isPending };
}

function GuardianSelect({
  draft,
  offered,
  onChange,
}: {
  draft: GuardianDraftState;
  offered: readonly GuardianSummary[];
  onChange: PickerProps['onChange'];
}) {
  return (
    <SelectField
      label="Guardian"
      value={draft.existingId}
      hint="Their login stays the same. This child appears in their portal."
      onChange={(event) => {
        const chosen = offered.find(
          (guardian) => guardian.id === event.target.value
        );
        onChange({
          existingId: event.target.value,
          existingName: chosen?.fullName ?? '',
        });
      }}
    >
      <option value="">Choose a guardian</option>
      {offered.map((guardian) => (
        <option key={guardian.id} value={guardian.id}>
          {optionLabel(guardian)}
        </option>
      ))}
    </SelectField>
  );
}

function LookupField({
  idPrefix,
  onLookup,
}: {
  idPrefix: string;
  onLookup: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${idPrefix}-lookup`}>
        Or find by exact phone or email
      </Label>
      <Input
        id={`${idPrefix}-lookup`}
        onChange={(event) => {
          onLookup(event.target.value.trim());
        }}
      />
    </div>
  );
}

function ExistingFields({
  idPrefix,
  draft,
  onChange,
  studentId,
  takenIds,
}: Pick<
  PickerProps,
  'idPrefix' | 'draft' | 'onChange' | 'studentId' | 'takenIds'
>) {
  const [lookup, setLookup] = useState('');
  const { options, pending } = useGuardianOptions(studentId, lookup);
  const offered = options.filter(
    (guardian) =>
      guardian.id === draft.existingId || !takenIds.includes(guardian.id)
  );
  if (pending) {
    return <Skeleton className="h-8 w-full" />;
  }
  return (
    <>
      <GuardianSelect draft={draft} offered={offered} onChange={onChange} />
      <LookupField idPrefix={idPrefix} onLookup={setLookup} />
      {offered.length === 0 ? (
        <Alert>
          <AlertDescription>
            Every guardian in the school is already linked to this child. Choose
            New guardian instead.
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function LoginOption({
  id,
  value,
  title,
  hint,
}: {
  id: string;
  value: string;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="flex flex-col items-start gap-0">
        {title}
        <span className="text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      </Label>
    </div>
  );
}

function LoginChoice({
  idPrefix,
  draft,
  onChange,
  error,
}: Pick<PickerProps, 'idPrefix' | 'draft' | 'onChange'> & {
  error: string | undefined;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">How will they sign in?</legend>
      <RadioGroup
        value={draft.loginKind}
        onValueChange={(value) => {
          onChange({ loginKind: value === 'username' ? 'username' : 'email' });
        }}
      >
        <LoginOption
          id={`${idPrefix}-login-email`}
          value="email"
          title="With their email"
          hint="They get a link to set their own password."
        />
        <LoginOption
          id={`${idPrefix}-login-username`}
          value="username"
          title="With a username"
          hint="No email needed. They get a username and a temporary password to change at first sign-in."
        />
      </RadioGroup>
      {draft.loginKind === 'email' ? (
        <>
          <TextField
            label="Email"
            type="email"
            value={draft.email}
            onChange={(event) => {
              onChange({ email: event.target.value });
            }}
          />
          <FieldError message={error} />
        </>
      ) : (
        <p className="text-sm">
          Username <code className="font-mono">{usernamePreview(draft)}</code>
          <span className="block text-xs text-muted-foreground">
            A preview. The final username is chosen when you save.
          </span>
        </p>
      )}
    </fieldset>
  );
}

function NewFields({
  idPrefix,
  draft,
  onChange,
  errors,
}: Pick<PickerProps, 'idPrefix' | 'draft' | 'onChange' | 'errors'>) {
  return (
    <>
      <TextField
        label="Full name"
        value={draft.fullName}
        autoComplete="off"
        onChange={(event) => {
          onChange({ fullName: event.target.value });
        }}
      />
      <FieldError message={errors.fullName} />
      <TextField
        label="Phone"
        type="tel"
        value={draft.phone}
        onChange={(event) => {
          onChange({ phone: event.target.value });
        }}
      />
      <FieldError message={errors.phone} />
      <TextField
        label="House address"
        value={draft.address}
        onChange={(event) => {
          onChange({ address: event.target.value });
        }}
      />
      <FieldError message={errors.address} />
      <PhotoField
        name={draft.fullName}
        value={{ fileId: draft.photoFileId, preview: draft.photoPreview }}
        onChange={(photo) => {
          onChange({ photoFileId: photo.fileId, photoPreview: photo.preview });
        }}
      />
      <LoginChoice
        idPrefix={idPrefix}
        draft={draft}
        onChange={onChange}
        error={errors.email}
      />
    </>
  );
}

function ModeSwitch({
  idPrefix,
  mode,
  canCreate,
  onMode,
}: {
  idPrefix: string;
  mode: GuardianMode;
  canCreate: boolean;
  onMode: (mode: GuardianMode) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Guardian type</legend>
      <RadioGroup
        aria-label="Guardian type"
        value={mode}
        className="flex gap-4"
        onValueChange={(value) => {
          onMode(value === 'new' ? 'new' : 'existing');
        }}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="existing" id={`${idPrefix}-mode-existing`} />
          <Label htmlFor={`${idPrefix}-mode-existing`}>Existing guardian</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem
            value="new"
            id={`${idPrefix}-mode-new`}
            disabled={!canCreate}
          />
          <Label htmlFor={`${idPrefix}-mode-new`}>New guardian</Label>
        </div>
      </RadioGroup>
    </fieldset>
  );
}

export function GuardianPicker(props: PickerProps) {
  const { idPrefix, draft, onChange, errors } = props;
  return (
    <div className="flex flex-col gap-3">
      <ModeSwitch
        idPrefix={idPrefix}
        mode={draft.mode}
        canCreate={props.canCreate}
        onMode={(mode) => {
          onChange({ mode, existingId: '', existingName: '' });
        }}
      />
      {draft.mode === 'existing' ? (
        <ExistingFields {...props} />
      ) : (
        <NewFields
          idPrefix={idPrefix}
          draft={draft}
          onChange={onChange}
          errors={errors}
        />
      )}
      <SelectField
        label="Relationship to this child"
        value={draft.relationship}
        onChange={(event) => {
          const relationship = GUARDIAN_RELATIONSHIPS.find(
            (candidate) => candidate === event.target.value
          );
          onChange({ relationship: relationship ?? 'mother' });
        }}
      >
        {GUARDIAN_RELATIONSHIPS.map((relationship) => (
          <option key={relationship} value={relationship}>
            {GUARDIAN_RELATIONSHIP_LABELS[relationship]}
          </option>
        ))}
      </SelectField>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-pays`}
          checked={draft.paysFees}
          onCheckedChange={(on) => {
            onChange({ paysFees: on === true });
          }}
        />
        <Label htmlFor={`${idPrefix}-pays`}>
          Pays the school fees (receives the charges)
        </Label>
      </div>
    </div>
  );
}
