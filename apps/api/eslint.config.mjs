import base, { noDefaultExport, noEnum } from '../../eslint.config.mjs';

const classLevelAuth = {
  selector:
    'ClassDeclaration > Decorator > CallExpression[callee.name=/^(OrganizationAuth|SessionAuth)$/]',
  message:
    'Put the auth decorator on each handler, not the class, so the guard runs once.',
};

const processEnv = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Read configuration through loadEnv() in common/config/env.ts.',
};

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
          paths: [
            {
              name: 'pg',
              message:
                'Modules use the injected Kysely `Database`, not a Pool.',
            },
          ],
          patterns: [
            {
              group: ['react', 'react-dom', 'react-dom/*', '@tanstack/*'],
              message: 'Client packages do not belong in the API.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
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
];
