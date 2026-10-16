import { naira, parseNaira } from '@eduvault/shared';

export function parseFeeAmount(input: string): number | undefined {
  const minor = parseNaira(input.replaceAll(/[₦\s]/g, ''));
  return minor === undefined || minor <= 0 ? undefined : minor;
}

export const amountInputText = (minor: number): string =>
  naira(minor).replace('₦', '');
