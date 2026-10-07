import base from '../../eslint.config.mjs';

export default [
  ...base,
  {
    files: [
      'playwright.config.ts',
      'src/support/global-setup.ts',
      'src/support/ledger-reporter.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/cli.ts', 'src/support/ledger-reporter.ts'],
    rules: { 'no-console': 'off' },
  },
];
