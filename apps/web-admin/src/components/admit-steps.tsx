import type { ReactNode } from 'react';
import { InfoIcon, PlusIcon, XIcon } from 'lucide-react';
import {
  ADMIT_NO_CLASSES_MESSAGE,
  GUARDIAN_PERMISSION_LINK_MESSAGE,
  GUARDIAN_RELATIONSHIP_LABELS,
  maxGuardiansMessage,
  type AdmissionDuplicates,
  type AdmissionPreview,
} from '@eduvault/api-contract';
import { fmtDate } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  FieldError,
  SelectField,
  TextField,
} from '@eduvault/ui';
import {
  addedGuardian,
  canRemoveGuardian,
  chosenTerm,
  type AdmitForm,
  type Admitter,
  type StudentErrors,
} from '../admit-model';
import {
  loginNote,
  type DraftErrors,
  type GuardianDraftState,
} from '../guardian-draft';
import { GuardianPicker } from './guardian-picker';
import { PaysFeesBadge, PersonAvatar } from './student-bits';

type Change = (patch: Partial<AdmitForm>) => void;

function NameFields({
  form,
  errors,
  onChange,
}: {
  form: AdmitForm;
  errors: StudentErrors;
  onChange: Change;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <TextField
          label="First name"
          value={form.firstName}
          autoComplete="off"
          onChange={(event) => {
            onChange({ firstName: event.target.value });
          }}
        />
        <FieldError message={errors.firstName} />
      </div>
      <div className="flex flex-col gap-1">
        <TextField
          label="Last name"
          value={form.lastName}
          autoComplete="off"
          onChange={(event) => {
            onChange({ lastName: event.target.value });
          }}
        />
        <FieldError message={errors.lastName} />
      </div>
    </div>
  );
}

export function StudentStep({
  form,
  errors,
  today,
  onChange,
}: {
  form: AdmitForm;
  errors: StudentErrors;
  today: string;
  onChange: Change;
}) {
  return (
    <div className="flex flex-col gap-3">
      <NameFields form={form} errors={errors} onChange={onChange} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Gender"
          value={form.gender}
          onChange={(event) => {
            onChange({ gender: event.target.value === 'M' ? 'M' : 'F' });
          }}
        >
          <option value="F">Female</option>
          <option value="M">Male</option>
        </SelectField>
        <div className="flex flex-col gap-1">
          <TextField
            label="Date of birth"
            type="date"
            max={today}
            value={form.dateOfBirth}
            onChange={(event) => {
              onChange({ dateOfBirth: event.target.value });
            }}
          />
          <FieldError message={errors.dateOfBirth} />
        </div>
      </div>
    </div>
  );
}

function TermPicker({
  preview,
  termId,
  onChange,
}: {
  preview: AdmissionPreview;
  termId: string;
  onChange: Change;
}) {
  if (preview.nextTerm === null) {
    return null;
  }
  return (
    <SelectField
      label="Admit for"
      value={termId}
      onChange={(event) => {
        onChange({ termId: event.target.value });
      }}
    >
      <option value={preview.currentTerm.id}>
        {preview.currentTerm.name} (current)
      </option>
      <option value={preview.nextTerm.id}>{preview.nextTerm.name}</option>
    </SelectField>
  );
}

export function ClassStep({
  preview,
  form,
  onChange,
}: {
  preview: AdmissionPreview;
  form: AdmitForm;
  onChange: Change;
}) {
  if (preview.classes.length === 0) {
    return (
      <Alert>
        <InfoIcon />
        <AlertDescription>{ADMIT_NO_CLASSES_MESSAGE}</AlertDescription>
      </Alert>
    );
  }
  const term = chosenTerm(preview, form);
  return (
    <div className="flex flex-col gap-3">
      <TermPicker preview={preview} termId={term.id} onChange={onChange} />
      <SelectField
        label={`Class for ${term.name}`}
        value={form.classArmId}
        hint={`Creates their ${preview.currentSession.name} enrolment and a ${term.name} placement.`}
        onChange={(event) => {
          onChange({ classArmId: event.target.value });
        }}
      >
        {preview.classes.map((arm) => (
          <option key={arm.id} value={arm.id}>
            {arm.label}
          </option>
        ))}
      </SelectField>
      <Alert>
        <InfoIcon />
        <AlertDescription>
          {term.later
            ? `They will show “No class this term” until ${term.name} starts.`
            : 'Admitted mid-term? The bursar can charge this student on their own.'}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function GuardianCard({
  draft,
  index,
  props,
}: {
  draft: GuardianDraftState;
  index: number;
  props: GuardianStepProps;
}) {
  const { form, onChange, preview } = props;
  const update = (patch: Partial<GuardianDraftState>) => {
    onChange({
      guardians: form.guardians.map((candidate) =>
        candidate.key === draft.key ? { ...candidate, ...patch } : candidate
      ),
    });
  };
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Guardian {index + 1}</h3>
        {canRemoveGuardian(index, preview.requireGuardian) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({
                guardians: form.guardians.filter(
                  (candidate) => candidate.key !== draft.key
                ),
              });
            }}
          >
            <XIcon />
            Remove
          </Button>
        ) : null}
      </div>
      <GuardianPicker
        idPrefix={`admit-guardian-${draft.key}`}
        draft={draft}
        takenIds={form.guardians
          .filter((other) => other.key !== draft.key)
          .map((other) => other.existingId)
          .filter((id) => id !== '')}
        canCreate={props.admitter.canCreate}
        errors={props.errors[draft.key] ?? {}}
        onChange={update}
      />
    </li>
  );
}

interface GuardianStepProps {
  form: AdmitForm;
  preview: AdmissionPreview;
  admitter: Admitter;
  errors: Record<number, DraftErrors>;
  onChange: Change;
}

function AddGuardianRow({ props }: { props: GuardianStepProps }) {
  const { form, preview, onChange } = props;
  const count = form.guardians.length;
  if (count >= preview.maxGuardians) {
    return (
      <p className="text-sm text-muted-foreground">
        {maxGuardiansMessage(preview.maxGuardians)}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          onChange({
            guardians: [...form.guardians, addedGuardian(form.nextKey)],
            nextKey: form.nextKey + 1,
          });
        }}
      >
        <PlusIcon />
        {count === 0 ? 'Add a guardian now' : 'Add another guardian'}
      </Button>
      <span className="text-sm text-muted-foreground">
        {count} of {preview.maxGuardians}
      </span>
    </div>
  );
}

export function GuardianStep(props: GuardianStepProps) {
  const { form, admitter } = props;
  if (!admitter.canLink) {
    return (
      <Alert>
        <InfoIcon />
        <AlertDescription>{GUARDIAN_PERMISSION_LINK_MESSAGE}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {form.guardians.length === 0 ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            No guardian for now. You can add one later from the student’s row.
          </AlertDescription>
        </Alert>
      ) : (
        <ul className="flex flex-col gap-3">
          {form.guardians.map((draft, index) => (
            <GuardianCard
              key={draft.key}
              draft={draft}
              index={index}
              props={props}
            />
          ))}
        </ul>
      )}
      <AddGuardianRow props={props} />
    </div>
  );
}

function DuplicateWarning({
  matches,
}: {
  matches: AdmissionDuplicates['matches'];
}) {
  return (
    <Alert>
      <InfoIcon />
      <AlertTitle>This may be a student you already have</AlertTitle>
      <AlertDescription>
        <ul>
          {matches.map((match) => (
            <li key={`${match.name}-${match.admissionNumber ?? match.state}`}>
              {match.name} ·{' '}
              {match.studentId === undefined ? (
                'on another campus'
              ) : (
                <a
                  href={`/students/${match.studentId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline"
                >
                  {match.admissionNumber}
                </a>
              )}{' '}
              · {match.state}
            </li>
          ))}
        </ul>
        <p>
          Students are never deleted, so a duplicate can only be recorded as
          left. Check before you admit.
        </p>
      </AlertDescription>
    </Alert>
  );
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function ReviewGuardian({ draft }: { draft: GuardianDraftState }) {
  const name =
    draft.mode === 'new'
      ? draft.fullName
      : draft.existingName || 'Existing guardian';
  return (
    <li className="flex items-center gap-3 py-2">
      <PersonAvatar name={name} photoUrl={null} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 font-medium">
          {name}
          {draft.paysFees ? <PaysFeesBadge /> : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {GUARDIAN_RELATIONSHIP_LABELS[draft.relationship]} ·{' '}
          {loginNote(draft)}
        </span>
      </div>
      <Badge variant={draft.mode === 'new' ? 'success' : 'outline'}>
        {draft.mode === 'new' ? 'New' : 'Existing'}
      </Badge>
    </li>
  );
}

export function ReviewStep({
  form,
  preview,
  matches,
}: {
  form: AdmitForm;
  preview: AdmissionPreview;
  matches: AdmissionDuplicates['matches'];
}) {
  const arm = preview.classes.find((option) => option.id === form.classArmId);
  const term = chosenTerm(preview, form);
  return (
    <div className="flex flex-col gap-3">
      {matches.length > 0 ? <DuplicateWarning matches={matches} /> : null}
      <dl className="divide-y">
        <Pair label="Student">
          <strong>
            {form.firstName.trim()} {form.lastName.trim()}
          </strong>
        </Pair>
        <Pair label="Date of birth">{fmtDate(form.dateOfBirth)}</Pair>
        <Pair label="Gender">{form.gender === 'F' ? 'Female' : 'Male'}</Pair>
        <Pair label="Class">{arm?.label ?? '—'}</Pair>
        {term.later ? <Pair label="Term">{term.name}</Pair> : null}
        <Pair label="Student login">
          <code className="font-mono">{preview.nextStudentUsername}</code> with
          a temporary password
        </Pair>
      </dl>
      <ul className="divide-y">
        {form.guardians.map((draft) => (
          <ReviewGuardian key={draft.key} draft={draft} />
        ))}
      </ul>
    </div>
  );
}
