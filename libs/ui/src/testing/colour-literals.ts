import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const LITERALS = [
  /#[\da-f]{3}(?:[\da-f]{3}(?:[\da-f]{2})?)?\b/i,
  /\b(?:rgba?|hsla?|oklch)\(/i,
];

export function colourLiterals(css: string): string[] {
  const withoutComments = css.replaceAll(
    /\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g,
    ''
  );
  return LITERALS.flatMap((literal) => {
    const match = literal.exec(withoutComments);
    return match === null ? [] : [match[0]];
  });
}

export function colourLiteralsInCss(
  srcDir: string,
  skip: (file: string) => boolean = () => false
): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.css') && !skip(file))
    .flatMap((file) =>
      colourLiterals(readFileSync(path.join(srcDir, file), 'utf8')).map(
        (hit) => `${file} ${hit}`
      )
    );
}
