import { blend, contrastRatio, parseColor, type Rgba } from '@eduvault/ui';

/** A token and an optional alpha; a translucent surface is painted over `card`. */
export type TokenSide = readonly [token: string, alpha?: number];

export type ReadToken = (token: string) => Rgba | undefined;

export interface ContrastPair {
  label: string;
  text: TokenSide;
  surface: TokenSide;
}

const BODY_AA = 4.5;

export const readComputedToken: ReadToken = (token) =>
  parseColor(
    getComputedStyle(document.documentElement).getPropertyValue(`--${token}`)
  );

function paint(
  side: TokenSide,
  under: Rgba,
  read: ReadToken
): Rgba | undefined {
  const colour = read(side[0]);
  return colour === undefined
    ? undefined
    : blend({ ...colour, a: side[1] ?? colour.a }, under);
}

/** The pair's contrast ratio in the current theme, or undefined when a token is unreadable. */
export function pairRatio(
  pair: ContrastPair,
  read: ReadToken = readComputedToken
): number | undefined {
  const card = read('card');
  if (card === undefined) {
    return undefined;
  }
  const surface = paint(pair.surface, card, read);
  const text = surface && paint(pair.text, surface, read);
  return surface === undefined || text === undefined
    ? undefined
    : contrastRatio(text, surface);
}

function verdict(ratio: number | undefined): string {
  if (ratio === undefined) {
    return '';
  }
  return ratio >= BODY_AA ? 'Pass' : 'Below AA';
}

export function ContrastTable({
  pairs,
  read = readComputedToken,
}: {
  pairs: readonly ContrastPair[];
  read?: ReadToken;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 font-medium">Pair</th>
          <th className="py-1 font-medium">Ratio</th>
          <th className="py-1 font-medium">AA (4.5:1)</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((pair) => {
          const ratio = pairRatio(pair, read);
          return (
            <tr key={pair.label} className="border-t">
              <td className="py-1.5">{pair.label}</td>
              <td className="py-1.5 tabular-nums">
                {ratio === undefined ? 'n/a' : `${ratio.toFixed(2)}:1`}
              </td>
              <td className="py-1.5">{verdict(ratio)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
