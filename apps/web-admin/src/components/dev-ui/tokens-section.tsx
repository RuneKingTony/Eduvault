import { readComputedToken } from './contrast-table';

const SWATCHES = [
  ['background', 'bg-background'],
  ['foreground', 'bg-foreground'],
  ['card', 'bg-card'],
  ['primary', 'bg-primary'],
  ['primary-hover', 'bg-primary-hover'],
  ['primary-light', 'bg-primary-light'],
  ['primary-ink', 'bg-primary-ink'],
  ['secondary', 'bg-secondary'],
  ['muted', 'bg-muted'],
  ['accent', 'bg-accent'],
  ['destructive', 'bg-destructive'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['credit', 'bg-credit'],
  ['brand-deep', 'bg-brand-deep'],
  ['brand-teal', 'bg-brand-teal'],
  ['brand-mint', 'bg-brand-mint'],
  ['brand-gold', 'bg-brand-gold'],
  ['sidebar', 'bg-sidebar'],
  ['sidebar-primary', 'bg-sidebar-primary'],
  ['border', 'bg-border'],
] as const;

const hex = (channel: number) =>
  Math.round(channel).toString(16).padStart(2, '0');

function toHex(token: string): string {
  const colour = readComputedToken(token);
  return colour === undefined
    ? ''
    : `#${hex(colour.r)}${hex(colour.g)}${hex(colour.b)}`;
}

export function TokensSection() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {SWATCHES.map(([token, swatch]) => (
        <li key={token} className="flex items-center gap-2">
          <span className={`size-9 shrink-0 rounded-lg border ${swatch}`} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{token}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {toHex(token)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TypeSection() {
  return (
    <div className="flex flex-col gap-2">
      <h1>Page title in Playfair Display</h1>
      <h2>Section heading in Inter</h2>
      <h3>Smaller heading in Inter</h3>
      <h4>Smallest heading in Inter</h4>
      <p>Body text is Inter at 14px with a 1.5 line height.</p>
      <p className="font-mono">RCT-2026-00042 is a reference in Roboto Mono.</p>
      <p className="tabular-nums">₦12,345.67 uses tabular, lining figures.</p>
    </div>
  );
}
