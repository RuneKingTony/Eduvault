const bigFloorDiv = (numerator: bigint, denominator: bigint): bigint => {
  const quotient = numerator / denominator;
  return numerator % denominator !== 0n && numerator < 0n
    ? quotient - 1n
    : quotient;
};

/**
 * The product of `factors` over `denominator`, rounded half up. BigInt
 * throughout, so a product past 2^53 stays exact. Factors are whole numbers
 * and the denominator is positive.
 */
export function roundHalfUp(
  factors: readonly number[],
  denominator: number
): number {
  const numerator = factors.reduce(
    (product, factor) => product * BigInt(factor),
    1n
  );
  return Number(
    bigFloorDiv(2n * numerator + BigInt(denominator), 2n * BigInt(denominator))
  );
}
