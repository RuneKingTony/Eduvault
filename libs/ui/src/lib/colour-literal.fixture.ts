/* Each line must be rejected by the rule; reportUnusedDisableDirectives fails lint if one stops being caught. */
export const rejected = [
  // eslint-disable-next-line no-restricted-syntax
  '#0d2b2e',
  // eslint-disable-next-line no-restricted-syntax
  'rgb(13 43 46)',
  // eslint-disable-next-line no-restricted-syntax
  'rgba(13, 43, 46, 0.5)',
  // eslint-disable-next-line no-restricted-syntax
  'hsl(180 55% 12%)',
  // eslint-disable-next-line no-restricted-syntax
  'hsla(180, 55%, 12%, 0.5)',
  // eslint-disable-next-line no-restricted-syntax
  'oklch(0.3 0.05 190)',
  // eslint-disable-next-line no-restricted-syntax
  'flex bg-[#0d2b2e]',
  // eslint-disable-next-line no-restricted-syntax
  'hover:text-[rgb(13_43_46)]',
  // eslint-disable-next-line no-restricted-syntax
  'border-[oklch(0.3_0.05_190)]',
  // eslint-disable-next-line no-restricted-syntax
  'text-[color:var(--brand-deep)]',
  // eslint-disable-next-line no-restricted-syntax
  `ring #fff`,
];

export const allowed = [
  '#root',
  'bg-primary text-muted-foreground',
  'text-[0.8rem] max-w-[1240px]',
  'bg-destructive/12 shadow-md',
];
