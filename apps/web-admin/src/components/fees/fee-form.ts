import {
  FEE_LINE_AMOUNT_MESSAGE,
  TUITION_FEE_CODE,
  createFeeLineSchema,
  type CreateFeeLineInput,
  type FeeGroup,
  type FeeType,
} from '@eduvault/api-contract';
import { fieldValue } from '@eduvault/ui';
import { parseFeeAmount } from '../../fee-amount';

export const EVERY_CAMPUS = 'every-campus';

export type FeeFormResult =
  | { ok: true; body: ReturnType<typeof createFeeLineSchema.parse> }
  | { ok: false; message: string };

export function defaultFeeTypeId(
  feeTypes: readonly FeeType[],
  group: FeeGroup,
  chipId: string | undefined
): string {
  if (group === 'school') {
    return (
      feeTypes.find((feeType) => feeType.code === TUITION_FEE_CODE)?.id ?? ''
    );
  }
  const chip = feeTypes.find((feeType) => feeType.id === chipId);
  return (
    chip?.id ??
    feeTypes.find((feeType) => feeType.code !== TUITION_FEE_CODE)?.id ??
    ''
  );
}

export function feeFormBody(
  data: FormData,
  extra: { termId: string; isOptional: boolean }
): FeeFormResult {
  const amountMinor = parseFeeAmount(fieldValue(data, 'amount'));
  if (amountMinor === undefined) {
    return { ok: false, message: FEE_LINE_AMOUNT_MESSAGE };
  }
  const campus = fieldValue(data, 'campusId');
  const input: CreateFeeLineInput = {
    termId: extra.termId,
    classLevelId: fieldValue(data, 'classLevelId'),
    feeTypeId: fieldValue(data, 'feeTypeId'),
    campusId: campus === EVERY_CAMPUS ? null : campus,
    name: fieldValue(data, 'name'),
    amountMinor,
    appliesTo: fieldValue(data, 'appliesTo') as CreateFeeLineInput['appliesTo'],
    isOptional: extra.isOptional,
  };
  const parsed = createFeeLineSchema.safeParse(input);
  return parsed.success
    ? { ok: true, body: parsed.data }
    : {
        ok: false,
        message: parsed.error.issues[0]?.message ?? 'Check the details.',
      };
}
