import type { StudentLife } from '@eduvault/api-contract';
import { DUE_LEFT_AFTER_DAYS, INACTIVE_AFTER_DAYS } from '@eduvault/shared';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;

export interface LifecycleFacts {
  notSeenSince: string | null;
  exitKind: 'left' | 'graduated' | null;
  newInCurrentSession: boolean;
  today: string;
}

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

const daysAway = (facts: LifecycleFacts): number | null =>
  facts.notSeenSince === null
    ? null
    : daysBetween(facts.notSeenSince, facts.today);

export function lifeOf(facts: LifecycleFacts): StudentLife {
  if (facts.exitKind !== null) {
    return facts.exitKind;
  }
  const days = daysAway(facts);
  return days !== null && days >= INACTIVE_AFTER_DAYS ? 'inactive' : 'active';
}

export function isDueToBeLeft(facts: LifecycleFacts): boolean {
  const days = daysAway(facts);
  return (
    lifeOf(facts) === 'inactive' && days !== null && days >= DUE_LEFT_AFTER_DAYS
  );
}

export const isNewIntake = (facts: LifecycleFacts): boolean =>
  lifeOf(facts) === 'active' && facts.newInCurrentSession;

export function weeksAway(facts: LifecycleFacts): number | null {
  const days = daysAway(facts);
  return days === null ? null : Math.floor(Math.max(days, 0) / DAYS_PER_WEEK);
}
