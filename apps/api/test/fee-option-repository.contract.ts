import {
  feeOptionChangedActivity,
  type FinanceActor,
} from '../src/app/common/activity';
import type {
  FeeOptionRepository,
  OptionActivity,
  OptionChange,
} from '../src/app/modules/fee-line/fee-line.repository';

export interface FeeOptionHarness {
  repository: FeeOptionRepository;
  organizationId: string;
  userId: string;
  feeTypeId: string;
  students: { studentId: string; enrollmentId: string }[];
  recordedKinds: () => Promise<string[]>;
}

type TestFn = (
  title: string,
  run: (harness: FeeOptionHarness) => Promise<void>
) => unknown;

const actor = (harness: FeeOptionHarness): FinanceActor => ({
  organizationId: harness.organizationId,
  userId: harness.userId,
  name: 'Tunde Bakare',
  currency: 'NGN',
});

export const optionChange = (
  harness: FeeOptionHarness,
  student: number,
  optedIn: boolean
): { change: OptionChange; activity: OptionActivity } => {
  const { studentId, enrollmentId } = harness.students[student] ?? {
    studentId: '',
    enrollmentId: '',
  };
  return {
    change: {
      organizationId: harness.organizationId,
      userId: harness.userId,
      studentId,
      enrollmentId,
      feeTypeId: harness.feeTypeId,
      optedIn,
    },
    activity: (facts) =>
      feeOptionChangedActivity(actor(harness), {
        ...facts,
        enrollmentId,
        optedIn,
      }),
  };
};

const setOne = (
  harness: FeeOptionHarness,
  student: number,
  optedIn: boolean
) => {
  const { change: one, activity } = optionChange(harness, student, optedIn);
  return harness.repository.setOption(one, activity);
};

const heldBy = (harness: FeeOptionHarness, student: number) =>
  harness.repository.optedInFeeTypeIds(
    harness.organizationId,
    harness.students[student]?.enrollmentId ?? ''
  );

export function describeFeeOptionRepositoryContract(test: TestFn): void {
  test('answers true for an opt-in, and false with no second row for a replay', async (harness) => {
    expect(await setOne(harness, 0, true)).toBe(true);
    expect(await setOne(harness, 0, true)).toBe(false);
    expect(await heldBy(harness, 0)).toEqual([harness.feeTypeId]);
    expect(await harness.recordedKinds()).toEqual(['fee_option.opted_in']);
  });

  test('answers false and writes nothing for an opt-out of a fee the student never took', async (harness) => {
    expect(await setOne(harness, 0, false)).toBe(false);
    expect(await heldBy(harness, 0)).toEqual([]);
    expect(await harness.recordedKinds()).toEqual([]);
  });

  test('answers true for an opt-out of a held opt-in and writes an opted-out row', async (harness) => {
    await setOne(harness, 0, true);
    expect(await setOne(harness, 0, false)).toBe(true);
    expect(await heldBy(harness, 0)).toEqual([]);
    expect(await harness.recordedKinds()).toEqual([
      'fee_option.opted_in',
      'fee_option.opted_out',
    ]);
  });

  test('keeps the opt-ins of different enrolments apart', async (harness) => {
    await setOne(harness, 0, true);
    expect(await heldBy(harness, 1)).toEqual([]);
    expect(await setOne(harness, 1, false)).toBe(false);
    expect(await heldBy(harness, 0)).toEqual([harness.feeTypeId]);
  });

  test('counts only the batch changes that took effect and writes one row for each', async (harness) => {
    await setOne(harness, 0, true);
    const changed = await harness.repository.setOptions([
      optionChange(harness, 0, true),
      optionChange(harness, 1, true),
    ]);
    expect(changed).toBe(1);
    expect(await heldBy(harness, 1)).toEqual([harness.feeTypeId]);
    expect(await harness.recordedKinds()).toEqual([
      'fee_option.opted_in',
      'fee_option.opted_in',
    ]);
  });

  test('answers 0 and writes nothing for a replayed batch', async (harness) => {
    const batch = () => [
      optionChange(harness, 0, true),
      optionChange(harness, 1, true),
    ];
    expect(await harness.repository.setOptions(batch())).toBe(2);
    expect(await harness.repository.setOptions(batch())).toBe(0);
    expect(await harness.recordedKinds()).toHaveLength(2);
  });
}
