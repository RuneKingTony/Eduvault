import type { GuardianDetail, GuardianLink } from '@eduvault/api-contract';

export interface StudentRef {
  id: string;
  firstName: string;
  lastName: string;
  onRoll: boolean;
}

export type GuardianAction =
  | { kind: 'profile'; guardianId: string }
  | { kind: 'add'; student: StudentRef }
  | { kind: 'edit-link'; student: StudentRef; link: GuardianLink }
  | { kind: 'remove-link'; student: StudentRef; link: GuardianLink }
  | { kind: 'edit-details'; guardian: GuardianDetail }
  | { kind: 'reset-login'; guardian: GuardianDetail };
