import { readFileSync } from 'node:fs';
import path from 'node:path';
import { colourLiterals, colourLiteralsInCss } from '../testing';

describe('colour literals in CSS', () => {
  it.each([
    ['hex', 'a { color: #0d2b2e; }'],
    ['short hex', 'a { color: #fff; }'],
    ['rgb()', 'a { color: rgb(13 43 46); }'],
    ['rgba()', 'a { color: rgba(13, 43, 46, 0.5); }'],
    ['hsl()', 'a { color: hsl(180 55% 12%); }'],
    ['hsla()', 'a { color: hsla(180, 55%, 12%, 0.5); }'],
    ['oklch()', 'a { color: oklch(0.3 0.05 190); }'],
  ])('rejects %s', (_form, css) => {
    expect(colourLiterals(css)).not.toHaveLength(0);
  });

  it('allows tokens, mixes of tokens and comments', () => {
    expect(
      colourLiterals(
        '/* #fff rgb(0 0 0) */ a { color: var(--primary); background: color-mix(in srgb, var(--card) 50%, transparent); }'
      )
    ).toEqual([]);
  });

  it('keeps every other stylesheet in the library free of them', () => {
    expect(
      colourLiteralsInCss(
        path.join(import.meta.dirname, '..'),
        (file) => file === 'styles/theme.css'
      )
    ).toEqual([]);
  });

  it('is the one file allowed to hold them', () => {
    expect(
      colourLiterals(
        readFileSync(path.join(import.meta.dirname, 'theme.css'), 'utf8')
      )
    ).not.toHaveLength(0);
  });
});
