import base, { noDefaultExport, noEnum } from '../../eslint.config.mjs';

const classLevelAuth = {
  selector:
    'ClassDeclaration > Decorator > CallExpression[callee.name=/^(OrganizationAuth|SessionAuth|PlatformAuth)$/]',
  message:
    'Put the auth decorator on each handler, not the class, so the guard runs once.',
};

const handlerWithoutAuth = {
  selector:
    'MethodDefinition:has(Decorator > CallExpression[callee.name=/^(Get|Post|Put|Patch|Delete|All)$/]):not(:has(Decorator > CallExpression[callee.name=/^(OrganizationAuth|SessionAuth|PlatformAuth)$/]))',
  message:
    'Every HTTP handler needs @OrganizationAuth, @SessionAuth or @PlatformAuth; an unguarded route skips tenancy.',
};

const processEnv = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Read configuration through loadEnv() in common/config/env.ts.',
};

const pgImport = {
  name: 'pg',
  message: 'Repositories use the injected Kysely `Database`, not a Pool.',
};

const kyselyImport = {
  name: 'kysely',
  message:
    'Only a kysely-*.repository.ts may import Kysely; services and controllers go through a repository.',
};

const kyselySubpaths = {
  group: ['kysely/*'],
  message: kyselyImport.message,
};

const clientPackages = {
  group: ['react', 'react-dom', 'react-dom/*', '@tanstack/*'],
  message: 'Client packages do not belong in the API.',
};

const databaseInternals = [
  '**/db/tokens',
  '**/db/database.module',
  '**/db/db-types',
  '**/db/in-campus-scope',
  '**/db/rows',
].map((group) => ({
  group: [group],
  message:
    'Database internals belong to a kysely-*.repository.ts; services and controllers go through a repository.',
}));

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react-dom/*', '@tanstack/*'],
              message: 'Client packages do not belong in the API.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        noEnum,
        noDefaultExport,
        classLevelAuth,
        handlerWithoutAuth,
        processEnv,
      ],
    },
  },
  {
    files: ['src/app/modules/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [pgImport, kyselyImport],
          patterns: [clientPackages, kyselySubpaths, ...databaseInternals],
        },
      ],
    },
  },
  {
    files: ['src/app/modules/**/kysely-*.repository.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [pgImport], patterns: [clientPackages] },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'max-lines-per-function': 'off',
      'unicorn/prefer-top-level-await': 'off',
    },
  },
  {
    // The API builds to CommonJS, which has no top-level await, and exits the
    // process when startup fails.
    files: ['src/main.ts'],
    rules: {
      'unicorn/no-process-exit': 'off',
      'unicorn/prefer-top-level-await': 'off',
    },
  },
  {
    files: ['src/app/common/config/env.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noEnum,
        noDefaultExport,
        classLevelAuth,
      ],
    },
  },
  {
    // The health probe is the one deliberately public route.
    files: ['src/app/modules/health/health.controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noEnum,
        noDefaultExport,
        classLevelAuth,
        processEnv,
      ],
    },
  },
];
