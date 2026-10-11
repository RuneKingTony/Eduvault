import {
  GUARDIAN_PICK_MESSAGE,
  GUARDIAN_TWICE_MESSAGE,
  newGuardianSchema,
  type GuardianDraftInput,
  type GuardianRelationship,
} from '@eduvault/api-contract';
import { guardianUsernameBase } from '@eduvault/shared';

export type GuardianMode = 'existing' | 'new';

export interface GuardianDraftState {
  key: number;
  mode: GuardianMode;
  existingId: string;
  existingName: string;
  relationship: GuardianRelationship;
  paysFees: boolean;
  fullName: string;
  phone: string;
  address: string;
  photoFileId: string | null;
  photoPreview: string | null;
  loginKind: 'email' | 'username';
  email: string;
}

export type DraftErrors = Partial<
  Record<'fullName' | 'phone' | 'address' | 'email', string>
>;

export const newDraft = (
  key: number,
  start: {
    mode: GuardianMode;
    relationship: GuardianRelationship;
    paysFees: boolean;
  }
): GuardianDraftState => ({
  key,
  ...start,
  existingId: '',
  existingName: '',
  fullName: '',
  phone: '',
  address: '',
  photoFileId: null,
  photoPreview: null,
  loginKind: 'email',
  email: '',
});

const newGuardianInput = (draft: GuardianDraftState) => ({
  fullName: draft.fullName,
  phone: draft.phone,
  address: draft.address,
  relationship: draft.relationship,
  paysFees: draft.paysFees,
  ...(draft.photoFileId === null ? {} : { photoFileId: draft.photoFileId }),
  login:
    draft.loginKind === 'email'
      ? { kind: 'email' as const, email: draft.email }
      : { kind: 'username' as const },
});

const FIELDS: Record<string, keyof DraftErrors> = {
  fullName: 'fullName',
  phone: 'phone',
  address: 'address',
  login: 'email',
};

/** The server repeats these rules; the messages are the contract's, so both read the same. */
export function draftErrors(draft: GuardianDraftState): DraftErrors {
  if (draft.mode === 'existing') {
    return {};
  }
  const parsed = newGuardianSchema.safeParse(newGuardianInput(draft));
  const errors: DraftErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = FIELDS[String(issue.path[0])];
      if (field !== undefined) {
        errors[field] ??= issue.message;
      }
    }
  }
  return errors;
}

export const hasErrors = (errors: DraftErrors): boolean =>
  Object.keys(errors).length > 0;

export function toDraftInput(draft: GuardianDraftState): GuardianDraftInput {
  return draft.mode === 'existing'
    ? {
        existingGuardianId: draft.existingId,
        relationship: draft.relationship,
        paysFees: draft.paysFees,
      }
    : { new: newGuardianInput(draft) };
}

export function draftsProblem(
  drafts: readonly GuardianDraftState[]
): string | undefined {
  const existing = drafts.filter((draft) => draft.mode === 'existing');
  if (existing.some((draft) => draft.existingId === '')) {
    return GUARDIAN_PICK_MESSAGE;
  }
  const ids = existing.map((draft) => draft.existingId);
  return new Set(ids).size === ids.length ? undefined : GUARDIAN_TWICE_MESSAGE;
}

export function withPayer(
  drafts: readonly GuardianDraftState[]
): GuardianDraftState[] {
  const anyPays = drafts.some((draft) => draft.paysFees);
  return drafts.map((draft, index) =>
    index === 0 && !anyPays ? { ...draft, paysFees: true } : draft
  );
}

export const usernamePreview = (draft: GuardianDraftState): string =>
  guardianUsernameBase(draft.fullName === '' ? 'Guardian' : draft.fullName);

export function loginNote(draft: GuardianDraftState): string {
  if (draft.mode === 'existing') {
    return 'Existing guardian. Keeps their current login.';
  }
  return draft.loginKind === 'email'
    ? `Signs in with ${draft.email} and a temporary password.`
    : `Username ${usernamePreview(draft)} with a temporary password.`;
}
