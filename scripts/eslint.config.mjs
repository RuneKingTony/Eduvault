import base from '../eslint.config.mjs';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      'no-console': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/prefer-top-level-await': 'off',
    },
  },
];
