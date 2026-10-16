import type {
  FeeGridAmount,
  FeeGridCell,
  FeeGridRow,
  FeeLine,
  FeeType,
} from '@eduvault/api-contract';
import { typicalTotal } from './typical-total';

const amountOf = (line: FeeLine): FeeGridAmount => ({
  feeLineId: line.id,
  amountMinor: line.amountMinor,
  appliesTo: line.appliesTo,
  isOptional: line.isOptional,
});

const cellOf = (feeType: FeeType, lines: readonly FeeLine[]): FeeGridCell => {
  const own = lines.filter((line) => line.feeTypeId === feeType.id);
  const base = own.find((line) => line.campusId === null);
  return {
    feeTypeId: feeType.id,
    base: base === undefined ? null : amountOf(base),
    overrides: own
      .filter((line) => line.campusId !== null)
      .toSorted((a, b) =>
        (a.campusName ?? '').localeCompare(b.campusName ?? '')
      )
      .map((line) => ({
        ...amountOf(line),
        campusId: line.campusId ?? '',
        campusName: line.campusName ?? '',
      })),
  };
};

export function buildFeeGrid(options: {
  live: readonly FeeLine[];
  shown: readonly FeeType[];
  withTypicalTotal: boolean;
}): FeeGridRow[] {
  const { live, shown, withTypicalTotal } = options;
  const shownIds = new Set(shown.map((feeType) => feeType.id));
  const levels = new Map<string, FeeLine[]>();
  for (const line of live) {
    levels.set(line.classLevelId, [
      ...(levels.get(line.classLevelId) ?? []),
      line,
    ]);
  }
  return [...levels.values()]
    .filter((lines) => lines.some((line) => shownIds.has(line.feeTypeId)))
    .toSorted((a, b) => (a[0]?.levelSequence ?? 0) - (b[0]?.levelSequence ?? 0))
    .flatMap((lines) => {
      const [first] = lines;
      return first === undefined
        ? []
        : [
            {
              level: {
                id: first.classLevelId,
                name: first.levelName,
                sequence: first.levelSequence,
              },
              cells: shown.map((feeType) => cellOf(feeType, lines)),
              typicalTotalMinor: withTypicalTotal
                ? typicalTotal(lines, {
                    termId: first.termId,
                    classLevelId: first.classLevelId,
                  })
                : null,
            },
          ];
    });
}
