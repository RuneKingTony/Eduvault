import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../..'
);

// Config is loaded again in each worker; the env var carries one run id across them.
process.env['E2E_RUN_ID'] ??=
  `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;

export const runId = process.env['E2E_RUN_ID'];

export const env = {
  apiUrl: process.env['E2E_API_URL'] ?? 'http://localhost:3000',
  adminUrl: process.env['E2E_ADMIN_URL'] ?? 'http://localhost:4200',
  portalUrl: process.env['E2E_PORTAL_URL'] ?? 'http://localhost:4201',
};

export const artifactDir =
  process.env['E2E_ARTIFACT_DIR'] ?? resolve(repoRoot, 'tmp/e2e', runId);

export const ledgerPath = resolve(artifactDir, 'ledger.json');
export const personasPath = resolve(artifactDir, 'personas.json');
