import {
  ADMIT_DOB_MESSAGE,
  ADMIT_FIRST_NAME_REQUIRED,
  ADMIT_LAST_NAME_REQUIRED,
  type AdmissionPreview,
  type AdmitStudentInput,
  type StudentDetail,
} from '@eduvault/api-contract';
import {
  newDraft,
  toDraftInput,
  type GuardianDraftState,
} from './guardian-draft';

export const ADMIT_STEPS = ['student', 'class', 'guardian', 'review'] as const;
export type AdmitStep = 0 | 1 | 2 | 3;

export interface AdmitForm {
  step: AdmitStep;
  firstName: string;
  lastName: string;
  gender: 'F' | 'M';
  dateOfBirth: string;
  classArmId: string;
  termId: string;
  guardians: GuardianDraftState[];
  nextKey: number;
}

export interface Admitter {
  canLink: boolean;
  canCreate: boolean;
}

const firstGuardian = (key: number, admitter: Admitter) =>
  newDraft(key, {
    mode: admitter.canCreate ? 'new' : 'existing',
    relationship: 'mother',
    paysFees: true,
  });

export const addedGuardian = (key: number) =>
  newDraft(key, { mode: 'existing', relationship: 'father', paysFees: false });

export function initialAdmitForm(admitter: Admitter): AdmitForm {
  return {
    step: 0,
    firstName: '',
    lastName: '',
    gender: 'F',
    dateOfBirth: '',
    classArmId: '',
    termId: '',
    guardians: admitter.canLink ? [firstGuardian(1, admitter)] : [],
    nextKey: 2,
  };
}

export type StudentErrors = Partial<
  Record<'firstName' | 'lastName' | 'dateOfBirth', string>
>;

export function studentErrors(form: AdmitForm, today: string): StudentErrors {
  const errors: StudentErrors = {};
  if (form.firstName.trim() === '') {
    errors.firstName = ADMIT_FIRST_NAME_REQUIRED;
  }
  if (form.lastName.trim() === '') {
    errors.lastName = ADMIT_LAST_NAME_REQUIRED;
  }
  if (form.dateOfBirth === '' || form.dateOfBirth > today) {
    errors.dateOfBirth = ADMIT_DOB_MESSAGE;
  }
  return errors;
}

export function chosenTerm(
  preview: Pick<AdmissionPreview, 'currentTerm' | 'nextTerm'>,
  form: Pick<AdmitForm, 'termId'>
): { id: string; name: string; later: boolean } {
  const { nextTerm } = preview;
  return nextTerm !== null && form.termId === nextTerm.id
    ? { ...nextTerm, later: true }
    : { ...preview.currentTerm, later: false };
}

export function admittedToast(
  student: Pick<
    StudentDetail,
    | 'firstName'
    | 'lastName'
    | 'admissionNumber'
    | 'currentPlacement'
    | 'history'
  >
): string {
  const base = `${student.firstName} ${student.lastName} admitted as ${student.admissionNumber}.`;
  const from = student.history[0]?.placements.at(-1)?.termName;
  return student.currentPlacement === null && from !== undefined
    ? `${base} They have no class until ${from} starts.`
    : base;
}

export const canRemoveGuardian = (
  index: number,
  requireGuardian: boolean
): boolean => index > 0 || !requireGuardian;

export const canAdmit = (input: {
  canCreateStudent: boolean;
  canLink: boolean;
  requireGuardian: boolean | undefined;
}): boolean =>
  input.canCreateStudent && (input.canLink || input.requireGuardian !== true);

export function admitBody(form: AdmitForm): AdmitStudentInput {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    gender: form.gender,
    dateOfBirth: form.dateOfBirth,
    classArmId: form.classArmId,
    ...(form.termId === '' ? {} : { termId: form.termId }),
    guardians: form.guardians.map((draft) => toDraftInput(draft)),
  };
}
