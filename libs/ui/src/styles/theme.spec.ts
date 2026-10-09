import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blend, contrastRatio, parseColor, type Rgba } from '../lib/contrast';

const css = readFileSync(path.join(import.meta.dirname, 'theme.css'), 'utf8');

function tokens(selector: string): Map<string, string> {
  const block = new RegExp(
    String.raw`^${selector}\s*\{(?<body>[^}]*)\}`,
    'm'
  ).exec(css)?.groups?.['body'];
  return new Map(
    (block ?? '').split(';').flatMap((declaration) => {
      const [name = '', ...value] = declaration.split(':');
      return name.trim().startsWith('--')
        ? [[name.trim().slice(2), value.join(':').trim()] as const]
        : [];
    })
  );
}

const light = tokens(':root');
const modes = {
  light,
  dark: new Map([...light, ...tokens(String.raw`\.dark`)]),
} as const;

type Mode = keyof typeof modes;

function colour(mode: Mode, name: string): Rgba {
  const parsed = parseColor(modes[mode].get(name) ?? '');
  if (parsed === undefined) {
    throw new Error(`--${name} is not a colour in ${mode}`);
  }
  return parsed;
}

/** A token and an optional alpha; a translucent surface is painted over `card`. */
type Side = readonly [token: string, alpha?: number];

function ratio(mode: Mode, text: Side, surface: Side): number {
  const paint = ([token, alpha]: Side, under: Rgba) =>
    blend({ ...colour(mode, token), a: alpha ?? colour(mode, token).a }, under);
  const surfaceColour = paint(surface, colour(mode, 'card'));
  return contrastRatio(paint(text, surfaceColour), surfaceColour);
}

const body = 4.5;

const pairs: readonly (readonly [Side, Side])[] = [
  [['foreground'], ['background']],
  [['foreground'], ['card']],
  [['card-foreground'], ['card']],
  [['popover-foreground'], ['popover']],
  [['secondary-foreground'], ['secondary']],
  [['accent-foreground'], ['accent']],
  [['foreground'], ['muted']],
  [['muted-foreground'], ['background']],
  [['muted-foreground'], ['card']],
  [['muted-foreground'], ['muted']],
  [['muted-foreground'], ['accent']],
  [['primary-foreground'], ['primary']],
  [['primary-foreground'], ['primary-hover']],
  [['primary-ink'], ['card']],
  [['primary-ink'], ['background']],
  [['primary-ink'], ['primary-light']],
  [['destructive'], ['background']],
  [['destructive'], ['card']],
  [['destructive'], ['destructive', 0.12]],
  [['destructive'], ['destructive', 0.08]],
  [['destructive-foreground'], ['destructive']],
  [['success'], ['background']],
  [['success'], ['card']],
  [['success'], ['success', 0.14]],
  [['success'], ['success', 0.08]],
  [['success-foreground'], ['success']],
  [['credit'], ['background']],
  [['credit'], ['card']],
  [['credit'], ['credit', 0.12]],
  [['credit'], ['credit', 0.07]],
  [['credit-foreground'], ['credit']],
  [['warning'], ['background']],
  [['warning'], ['card']],
  [['warning-foreground'], ['warning']],
  [['warning-ink'], ['warning', 0.25]],
  [['sidebar-foreground'], ['sidebar']],
  [['sidebar-foreground'], ['sidebar-accent']],
  [['sidebar-accent-foreground'], ['sidebar-accent']],
  [['sidebar-muted'], ['sidebar']],
  [['sidebar-primary-foreground'], ['sidebar-primary']],
  [['brand-mint'], ['sidebar']],
  [['sidebar-foreground'], ['brand-deep']],
];

describe('theme.css contrast (WCAG AA)', () => {
  describe.each(['light', 'dark'] as const)('%s', (mode) => {
    it.each(pairs)('%j on %j reaches 4.5:1', (text, surface) => {
      expect(ratio(mode, text, surface)).toBeGreaterThanOrEqual(body);
    });
  });
});

describe('theme.css tokens', () => {
  it('defines the brand palette in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const name of [
        'brand-deep',
        'brand-teal',
        'brand-mint',
        'brand-gold',
        'primary-hover',
        'primary-light',
        'primary-ink',
        'overlay',
        'shadow-color',
        'av-l',
        'av-c',
        'av-fg-l',
        'credit',
        'credit-foreground',
        'sidebar-muted',
      ]) {
        expect(modes[mode].has(name), `--${name} in ${mode}`).toBe(true);
      }
    }
  });

  it('leaves out the prototype tooling tokens', () => {
    expect(css).not.toMatch(/--chrome/);
  });

  it('has one reduced-motion block and no load splash', () => {
    expect(css.match(/prefers-reduced-motion/g)).toHaveLength(1);
    expect(css).not.toMatch(/splash/i);
  });

  it('generates the 24 avatar hue classes', () => {
    for (let bucket = 0; bucket < 24; bucket += 1) {
      expect(css).toContain(`.avatar-h-${bucket} {`);
    }
  });
});
