import path from 'node:path';
import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import checkFile from 'eslint-plugin-check-file';
import eslintConfigPrettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import pluginQuery from '@tanstack/eslint-plugin-query';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import importX from 'eslint-plugin-import-x';
import regexp from 'eslint-plugin-regexp';
import vitest from '@vitest/eslint-plugin';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

const tsFiles = ['**/*.ts', '**/*.tsx', '**/*.mts'];
const reactFiles = ['**/*.tsx'];

const onlyFor = (files, configs) =>
  configs.map((config) => ({ ...config, files }));

const promote = (level) => (level === 'warn' || level === 1 ? 'error' : level);

// Presets ship some rules as `warn`, and the Nx lint target has no
// --max-warnings, so a warning would be invisible.
const asErrors = (config) => ({
  ...config,
  rules: Object.fromEntries(
    Object.entries(config.rules ?? {}).map(([name, setting]) => [
      name,
      Array.isArray(setting)
        ? [promote(setting[0]), ...setting.slice(1)]
        : promote(setting),
    ])
  ),
});

const rawColourClass =
  '^(?:[a-z-]+:)*-?(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|decoration|accent|caret|shadow|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(?:-\\d+)?(?:/\\d+)?$';

export const tailwindConfig = (entryPoint) => [
  {
    files: reactFiles,
    plugins: { 'better-tailwindcss': betterTailwindcss },
    settings: { 'better-tailwindcss': { entryPoint } },
    rules: {
      ...betterTailwindcss.configs['recommended-error'].rules,
      'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            {
              pattern: rawColourClass,
              message: 'Use a semantic theme token such as bg-primary.',
            },
          ],
        },
      ],
    },
  },
];

export const noEnum = {
  selector: 'TSEnumDeclaration',
  message: 'Use a const object with `as const`, or a string-literal union.',
};

const colourMessage =
  'Use a semantic theme token such as bg-primary; colour literals live in libs/ui/src/styles/theme.css only.';

export const noColourLiterals = [
  String.raw`#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b`,
  String.raw`\b(?:rgba?|hsla?|oklch)\(`,
  String.raw`(?:^|[\s:"'])-?(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|decoration|accent|caret|shadow|placeholder)-\[(?:#|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|color:)`,
].flatMap((pattern) => [
  { selector: `Literal[value=/${pattern}/]`, message: colourMessage },
  {
    selector: `TemplateElement[value.raw=/${pattern}/]`,
    message: colourMessage,
  },
]);

export const noDefaultExport = {
  selector: 'ExportDefaultDeclaration',
  message: 'Use a named export so imports stay greppable and renames safe.',
};

export const reactConfig = [
  ...onlyFor(reactFiles, [
    react.configs.flat.recommended,
    react.configs.flat['jsx-runtime'],
    reactHooks.configs.flat.recommended,
    jsxA11y.flatConfigs.recommended,
    ...pluginQuery.configs['flat/recommended'],
  ]),
  {
    files: reactFiles,
    settings: { react: { version: 'detect' } },
    rules: {
      'react/prop-types': 'off',
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/unsupported-syntax': 'off',
      '@tanstack/query/no-rest-destructuring': 'error',
      'react/button-has-type': 'error',
      'react/jsx-boolean-value': 'error',
      'react/jsx-curly-brace-presence': [
        'error',
        { props: 'never', children: 'never' },
      ],
      'react/jsx-no-target-blank': 'error',
      'react/no-array-index-key': 'error',
      'react/no-unstable-nested-components': 'error',
      'react/self-closing-comp': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
];

const importMetaEnv = {
  selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
  message: 'Read build-time env in src/env.ts only and import the constant.',
};

export const spaConfig = [
  ...reactConfig,
  ...tailwindConfig('src/styles.css'),
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Call the API through useApi() from ./api.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['better-auth', 'better-auth/*'],
              message:
                'Use createEduvaultAuthClient from @eduvault/auth-client.',
            },
            {
              group: ['@nestjs/*', 'express', 'kysely', 'pg'],
              message: 'Server packages do not belong in a SPA.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        noEnum,
        noDefaultExport,
        importMetaEnv,
        ...noColourLiterals,
      ],
    },
  },
  {
    files: ['src/env.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noEnum,
        noDefaultExport,
        ...noColourLiterals,
      ],
    },
  },
  {
    // Specs assert token values, so they may spell colours out.
    files: ['src/**/*.spec.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', noEnum, noDefaultExport, importMetaEnv],
    },
  },
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/coverage',
      '**/.nx',
      '**/routeTree.gen.ts',
      '**/db-types.ts',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'scope:web-admin',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:web-admin'],
            },
            {
              sourceTag: 'scope:web-portal',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:web-portal'],
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:api'],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
          ],
        },
      ],
    },
  },
  ...onlyFor(tsFiles, [
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
  ]),
  {
    files: tsFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...onlyFor(tsFiles, [
    asErrors(sonarjs.configs.recommended),
    asErrors(unicorn.configs.recommended),
    asErrors(regexp.configs['flat/recommended']),
  ]),
  {
    files: tsFiles,
    plugins: { 'import-x': importX },
    settings: {
      'import-x/extensions':
        importX.flatConfigs.typescript.settings['import-x/extensions'],
      'import-x/parsers':
        importX.flatConfigs.typescript.settings['import-x/parsers'],
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: path.join(import.meta.dirname, 'tsconfig.base.json'),
        }),
      ],
    },
    rules: {
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
      'import-x/no-self-import': 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.js', '**/*.mjs'],
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
    },
  },
  {
    files: tsFiles,
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-nested-ternary': 'error',
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'no-unneeded-ternary': 'error',
      'no-implicit-coercion': 'error',
      'no-param-reassign': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 3],
      'max-lines-per-function': [
        'error',
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      '@typescript-eslint/max-params': ['error', { max: 3 }],
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-use-before-define': [
        'error',
        { functions: false },
      ],
      '@typescript-eslint/strict-boolean-expressions': 'error',
      'unicorn/filename-case': 'off',
      'unicorn/import-style': [
        'error',
        { styles: { 'node:path': { default: true, named: true } } },
      ],
      'unicorn/no-useless-undefined': [
        'error',
        { checkArguments: false, checkArrowFunctionBody: false },
      ],
      'unicorn/no-nested-ternary': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/prefer-read-only-props': 'off',
      'no-restricted-syntax': ['error', noEnum, ...noColourLiterals],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/dot-notation': [
        'error',
        { allowIndexSignaturePropertyAccess: true },
      ],
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
      ],
    },
  },
  {
    files: ['**/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noEnum,
        noDefaultExport,
        ...noColourLiterals,
      ],
    },
  },
  {
    files: ['**/src/**/*.{ts,tsx}', '**/test/**/*.ts'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.{ts,tsx}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': [
        'error',
        { '**/src/**/': 'KEBAB_CASE', '**/test/**/': 'KEBAB_CASE' },
      ],
    },
  },
  {
    files: ['**/src/routes/**/*.{ts,tsx}'],
    rules: { 'check-file/filename-naming-convention': 'off' },
  },
  {
    // Specs assert token values, so they may spell colours out.
    files: ['**/src/**/*.spec.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', noEnum, noDefaultExport] },
  },
  {
    ...asErrors(vitest.configs.recommended),
    files: ['**/*.spec.{ts,tsx}', '**/test/**/*.ts'],
  },
  {
    files: ['**/*.spec.{ts,tsx}', '**/test/**/*.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'unicorn/no-await-expression-member': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  eslintConfigPrettier,
  {
    // eslint-config-prettier disables `curly`; braces on every block is safe with Prettier.
    files: tsFiles,
    rules: { curly: ['error', 'all'] },
  },
];
