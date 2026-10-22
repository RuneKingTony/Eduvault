import type { FeeAppliesTo, FeeLine } from '@eduvault/api-contract';
import { countOf, fmtTimestamp } from '@eduvault/shared';

export const APPLIES_TO_LABELS: Record<FeeAppliesTo, string> = {
  all: 'Everyone',
  new: 'New students only',
  returning: 'Returning only',
};

export const GRID_APPLIES_TO_LABELS: Record<
  Exclude<FeeAppliesTo, 'all'>,
  string
> = {
  new: 'New students only',
  returning: 'Returning students only',
};

export const FEES_TIP =
  'Parents see what each naira is for. Changing a fee never changes charges already sent.';
export const TYPICAL_TOTAL_TIP =
  'School fees plus the other fees every student pays. Optional fees and new-student-only fees are left out.';
export const OPTIONAL_TIP = 'Billed only to students who opted in';
export const OVERRIDE_TIP =
  'Campus override: replaces the every-campus amount there';
export const CAMPUS_OVERRIDE_TIP = 'Campus override';
export const EVERY_CAMPUS_LABEL = 'Every campus';

export const retiredTip = (line: Pick<FeeLine, 'retiredAt'>): string =>
  `Retired ${fmtTimestamp(line.retiredAt)}. Kept for history.`;

export const feeCount = (fees: number, levels: number): string =>
  `${fees} ${fees === 1 ? 'fee' : 'fees'} across ${levels} ${levels === 1 ? 'level' : 'levels'}.`;

export const addedToast = (name: string): string =>
  `Added ${name}. It applies from the next round of charges.`;

export const amountChangedToast = (name: string, amount: string): string =>
  `${name} is now ${amount}. Charges already sent keep the old amount.`;

export const retiredToast = (name: string): string =>
  `${name} retired. It is kept for history.`;

export const copyFeesBody = (count: number, source: string): string =>
  `Copies the ${countOf(count, 'active fee', 'active fees')} of ${source}, with the same amounts, campuses and rules. Retired fees stay behind. Change any amount afterwards.`;

export const copiedFeesToast = (count: number, source: string): string =>
  `Copied ${countOf(count, 'fee', 'fees')} from ${source}. They apply from the next round of charges.`;

export const feeTypeAddedToast = (name: string): string =>
  `${name} added as a fee type.`;

export const optionToast = (
  firstName: string,
  feeType: string,
  optedIn: boolean
): string =>
  optedIn
    ? `${firstName} now takes ${feeType} from the next round of charges.`
    : `${firstName} no longer takes ${feeType} from the next round of charges.`;

export const optInsToast = (
  feeType: string,
  optedIn: boolean,
  counts: { selected: number; changed: number }
): string => {
  if (counts.changed === 0) {
    return optedIn
      ? `No change: the selected students already take ${feeType}.`
      : `No change: the selected students already don't take ${feeType}.`;
  }
  const students = countOf(counts.selected, 'student', 'students');
  const verb = counts.selected === 1 ? 'takes' : 'take';
  return optedIn
    ? `${students} now ${verb} ${feeType} from the next round of charges.`
    : `${students} no longer ${verb} ${feeType}.`;
};

export const ENTER_AMOUNT = 'Enter an amount.';
