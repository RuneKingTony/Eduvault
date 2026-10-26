import type { INestApplicationContext } from '@nestjs/common';
import type { OrgContext } from '../../../src/app/common/auth';
import type { DemoCampus } from './config';
import type { FamilyNumber, StudentNumber } from './people-plan';
import type { DemoPlan } from './plan';

export interface CheckInput {
  app: INestApplicationContext;
  plan: DemoPlan;
  organizationId: string;
  owner: OrgContext;
  studentIds: ReadonlyMap<StudentNumber, string>;
  payerIds: ReadonlyMap<FamilyNumber, string>;
  campusIds: ReadonlyMap<DemoCampus, string>;
  itemIds: ReadonlyMap<string, string>;
  rerun: () => Promise<boolean>;
}

export const matcher =
  (failures: string[]) =>
  (what: string, got: number, want: number): void => {
    if (got !== want) {
      failures.push(`${what}: expected ${want}, found ${got}`);
    }
  };

export function exact(what: string, got: number, want: number): string[] {
  const failures: string[] = [];
  matcher(failures)(what, got, want);
  return failures;
}

/** Checks both directions, so a group the plan does not expect fails too. */
export function sameGroups(
  what: string,
  got: ReadonlyMap<string, number>,
  want: ReadonlyMap<string, number>
): string[] {
  const failures: string[] = [];
  const same = matcher(failures);
  for (const key of new Set([...got.keys(), ...want.keys()])) {
    same(`${what} (${key})`, got.get(key) ?? 0, want.get(key) ?? 0);
  }
  return failures;
}

export function tally(keys: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
