import { TUITION_FEE_CODE, type FeeGroup } from '@eduvault/api-contract';

export const inFeeGroup = (
  code: number,
  group: FeeGroup | undefined
): boolean =>
  group === undefined || (group === 'school') === (code === TUITION_FEE_CODE);
