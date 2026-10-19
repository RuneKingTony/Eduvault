import {
  contract,
  contractChecked,
  type ApiFake,
  type AppContract,
} from '@eduvault/api-contract';
import type { Api } from './api';

// Specs whose fake API still answers with ids or bodies the contract rejects. Fix a spec's
// fixtures, then delete its line here so the spec is held to the contract.
const NOT_YET_CHECKED: readonly string[] = [
  'src/components/add-member-sheet.spec.tsx',
  'src/components/admit-student-sheet.spec.tsx',
  'src/components/calendar/add-holiday-dialog.spec.tsx',
  'src/components/calendar/delete-year-dialog.spec.tsx',
  'src/components/calendar/edit-dates-dialog.spec.tsx',
  'src/components/calendar/make-current-dialog.spec.tsx',
  'src/components/calendar/new-year-dialog.spec.tsx',
  'src/components/dashboard/announcements-card.spec.tsx',
  'src/components/dashboard/my-classes-card.spec.tsx',
  'src/components/dashboard/roll-card.spec.tsx',
  'src/components/dashboard/school-account-card.spec.tsx',
  'src/components/dashboard/teacher-stats.spec.tsx',
  'src/components/guardian-dialogs.spec.tsx',
  'src/components/guardian-picker.spec.tsx',
  'src/components/invoices/new-charge-sheet.spec.tsx',
  'src/components/leave/leave-ui.spec.tsx',
  'src/components/start-year-dialog.spec.tsx',
  'src/components/student-lifecycle-dialogs.spec.tsx',
  'src/pages/admissions-page.spec.tsx',
  'src/pages/announcements-page.spec.tsx',
  'src/pages/billing-page.spec.tsx',
  'src/pages/billing-run-page.spec.tsx',
  'src/pages/calendar-page.spec.tsx',
  'src/pages/campuses-page.spec.tsx',
  'src/pages/class-page.spec.tsx',
  'src/pages/classes-page.spec.tsx',
  'src/pages/danger-zone-page.spec.tsx',
  'src/pages/dashboard-page.spec.tsx',
  'src/pages/invoice-page.spec.tsx',
  'src/pages/invoices-page.spec.tsx',
  'src/pages/member-page.spec.tsx',
  'src/pages/members-page.spec.tsx',
  'src/pages/money-accounts-page.spec.tsx',
  'src/pages/other-fees-page.spec.tsx',
  'src/pages/role-page.spec.tsx',
  'src/pages/roles-page.spec.tsx',
  'src/pages/student-page.spec.tsx',
  'src/pages/students-page.spec.tsx',
  'src/pages/subjects-page.spec.tsx',
  'src/pages/who-owes-page.spec.tsx',
];

const heldToContract = (): boolean => {
  const path = expect.getState().testPath ?? '';
  return !NOT_YET_CHECKED.some((spec) => path.endsWith(spec));
};

/** Holds a hand-written fake API to the real contract: valid requests, answers the client would parse. */
export const checked = (api: Partial<Record<keyof Api, unknown>>): Api =>
  heldToContract()
    ? contractChecked(contract, api as ApiFake<AppContract>)
    : (api as unknown as Api);
