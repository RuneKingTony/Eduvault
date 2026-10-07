import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, type Page } from '@playwright/test';
import { artifactDir, personasPath } from './env';
import type { Fixture, PersonaRecord } from './personas';

export const loadFixture = (): Fixture =>
  JSON.parse(readFileSync(personasPath, 'utf8')) as Fixture;

/** Saves step-NN-<name>.png under the run's artefact directory, numbered in call order. */
export function shooter(page: Page, project: string) {
  const dir = resolve(artifactDir, project);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  return async (name: string): Promise<void> => {
    n += 1;
    const file = `step-${String(n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: resolve(dir, file), fullPage: true });
  };
}

/** Skips the running test as BLOCKED (not passed) when the persona could not be created. */
export function requirePersona(persona: PersonaRecord): void {
  if (persona.blocked === null) return;
  test
    .info()
    .annotations.push({ type: 'BLOCKED', description: persona.blocked });
  test.skip(true, `BLOCKED (environment): ${persona.blocked}`);
}
