import {
  BILLING_ONLY_DRAFTS_MESSAGE,
  type BillingRunStatus,
  type BillingTerm,
  type InvoiceKind,
} from '@eduvault/api-contract';
import { countOf } from '@eduvault/shared';

export const BILLING_TIP =
  'Charges already sent are never edited. A mistake is fixed with an approved fee reduction.';

export const STATUS_LABELS: Readonly<Record<BillingRunStatus, string>> = {
  draft: 'Prepared',
  issued: 'Sent',
  cancelled: 'Cancelled',
};

export const KIND_LABELS: Readonly<Record<InvoiceKind, string>> = {
  term: 'Term fees',
  adhoc: 'One-off',
  store: 'Store purchase',
};

export const SCOPE_OPTIONS = [
  { value: 'school', label: 'Everyone I can see' },
  { value: 'campus', label: 'One campus' },
  { value: 'level', label: 'One level' },
] as const;

export const NOT_NUMBERED = 'Given when sent';

const CHARGED_MARKS = {
  all: ' (already charged)',
  partly: ' (partly charged)',
  none: '',
} as const;

export const termLabel = (term: BillingTerm): string =>
  `${term.name}, ${term.schoolYearName}`;

export const termOptionLabel = (term: BillingTerm): string =>
  `${termLabel(term)}${CHARGED_MARKS[term.charged]}`;

export const chargesCount = (count: number): string =>
  countOf(count, 'charge', 'charges');

export const preparedToast = (created: number): string =>
  `${chargesCount(created)} ready to check.`;

export const nothingNewToast = (skipped: number): string =>
  `0 new, ${skipped} already charged. Nobody was charged twice.`;

export const sentToast = (count: number): string =>
  `${chargesCount(count)} sent.`;

export const cancelledToast = (number: string): string =>
  `${number} cancelled. ${BILLING_ONLY_DRAFTS_MESSAGE}`;
