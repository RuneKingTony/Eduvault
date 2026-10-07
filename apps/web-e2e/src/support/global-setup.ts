import { mkdirSync, writeFileSync } from 'node:fs';
import { apiIsUp } from './api';
import { artifactDir, env, ledgerPath, personasPath } from './env';
import { Ledger } from './ledger';
import { provision } from './personas';

export default async function globalSetup(): Promise<void> {
  if (!(await apiIsUp())) {
    throw new Error(
      `BLOCKED (environment): ${env.apiUrl}/health is not answering. Start the stack with the run-local recipe.`
    );
  }
  mkdirSync(artifactDir, { recursive: true });
  const fixture = await provision(new Ledger(ledgerPath));
  writeFileSync(personasPath, JSON.stringify(fixture, null, 2));
}
