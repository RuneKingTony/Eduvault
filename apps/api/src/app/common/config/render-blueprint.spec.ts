import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { loadEnv } from './env';

interface BlueprintService {
  name: string;
  buildCommand: string;
  envVars: { key: string; value?: string }[];
}

const repoRoot = resolve(import.meta.dirname, '../../../../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

const VARIABLE_LINE = /^ {2}([A-Z][A-Z\d_]+):/gm;

const firstGroups = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].flatMap((match) => match[1] ?? []);

const declaredNames = (path: string) => firstGroups(read(path), VARIABLE_LINE);

const services = () =>
  (parse(read('render.yaml')) as { services: BlueprintService[] }).services;

const service = (name: string) => {
  const found = services().find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`render.yaml has no ${name} service`);
  }
  return found;
};

const variables = (name: string) =>
  service(name).envVars.map((variable) => variable.key);

const stagingDocs = () => {
  const [, section = ''] = read('docs/development.md').split(
    '\n## Staging (Render)\n'
  );
  return section.split('\n## ')[0] ?? '';
};

const requiredWithoutDefault = () => {
  try {
    loadEnv({});
  } catch (error) {
    return firstGroups((error as Error).message, VARIABLE_LINE);
  }
  return [];
};

const renderOnly = new Set(['NODE_VERSION']);

describe('render.yaml', () => {
  it('sets only variables the API reads, plus Render settings', () => {
    const known = new Set([
      ...declaredNames('apps/api/src/app/common/config/env.ts'),
      ...declaredNames('apps/api/src/app/common/auth/bootstrap-admin.ts'),
      ...renderOnly,
    ]);
    expect(
      variables('eduvault-api').filter((name) => !known.has(name))
    ).toEqual([]);
  });

  it('sets every variable the API requires without a default', () => {
    const required = requiredWithoutDefault();
    expect(required).toContain('DATABASE_URL');
    expect(
      required.filter((name) => !variables('eduvault-api').includes(name))
    ).toEqual([]);
  });

  it('sets the cookie domain and the R2 file store', () => {
    expect(variables('eduvault-api')).toEqual(
      expect.arrayContaining([
        'AUTH_COOKIE_DOMAIN',
        'FILE_STORE_DRIVER',
        'S3_BUCKET',
        'S3_REGION',
        'S3_ENDPOINT',
        'S3_FORCE_PATH_STYLE',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ])
    );
  });

  it('pins the Node version of .nvmrc on every service', () => {
    const nodeVersion = read('.nvmrc').trim();
    for (const { name, envVars } of services()) {
      expect([name, envVars.find(({ key }) => key === 'NODE_VERSION')]).toEqual(
        [name, expect.objectContaining({ value: nodeVersion })]
      );
    }
  });

  it('sets the build-time URLs each SPA reads', () => {
    expect(variables('eduvault-web-admin')).toEqual(
      expect.arrayContaining(['VITE_API_URL', 'VITE_PORTAL_URL'])
    );
    expect(variables('eduvault-web-portal')).toEqual(
      expect.arrayContaining(['VITE_API_URL', 'VITE_ADMIN_URL'])
    );
  });

  it('installs dev dependencies in every build', () => {
    for (const { name, buildCommand } of services()) {
      expect([name, buildCommand]).toEqual([
        name,
        expect.stringContaining('--prod=false'),
      ]);
    }
  });

  it('is described, variable by variable, in the staging docs', () => {
    const documented = new Set(
      firstGroups(stagingDocs(), /`([A-Z][A-Z\d_]+)`/g)
    );
    const set = services().flatMap((entry) =>
      entry.envVars.map((variable) => variable.key)
    );
    expect(
      [...set, ...requiredWithoutDefault()].filter(
        (name) => !documented.has(name)
      )
    ).toEqual([]);
  });
});
