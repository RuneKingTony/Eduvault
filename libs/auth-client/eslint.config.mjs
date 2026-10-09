import base, { reactConfig, tailwindConfig } from '../../eslint.config.mjs';

export default [
  ...base,
  ...reactConfig,
  ...tailwindConfig('../ui/src/styles/theme.css'),
];
