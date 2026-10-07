import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// The apps consume libs/ui from source, so the `@/` alias the shadcn CLI writes
// cannot resolve there. Rewrite it to a relative path. The CLI also swaps the
// `cn` helper for the unrelated `cn` npm package, which is undone here.
const uiRoot = resolve(import.meta.dirname, '../libs/ui');
const srcRoot = join(uiRoot, 'src');
const packageJson = join(uiRoot, 'package.json');

const toRelative = (file: string, target: string) => {
  const rel = relative(dirname(file), join(srcRoot, target));
  return rel.startsWith('.') ? rel : `./${rel}`;
};

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

const utilsFile = join(srcRoot, 'lib/utils.ts');
const utilsSource = `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
`;
if (readFileSync(utilsFile, 'utf8') !== utilsSource) {
  writeFileSync(utilsFile, utilsSource);
  console.log('restored lib/utils.ts');
}

for (const file of walk(srcRoot)) {
  const source = readFileSync(file, 'utf8');
  const rewritten = source
    .replace(
      /(from\s+['"])@\/([^'"]+)(['"])/g,
      (_match, open: string, target: string, close: string) =>
        `${open}${toRelative(file, target)}${close}`
    )
    .replace(
      /(from\s+['"])cn(['"])/g,
      (_match, open: string, close: string) =>
        `${open}${toRelative(file, 'lib/utils')}${close}`
    );
  if (rewritten !== source) {
    writeFileSync(file, rewritten);
    console.log(`localized ${relative(srcRoot, file)}`);
  }
}

const manifest = JSON.parse(readFileSync(packageJson, 'utf8')) as {
  dependencies: Record<string, string>;
};
if ('cn' in manifest.dependencies) {
  Reflect.deleteProperty(manifest.dependencies, 'cn');
  writeFileSync(packageJson, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('removed the cn package from libs/ui/package.json');
}

const theme = join(srcRoot, 'styles/theme.css');
const themeSource = readFileSync(theme, 'utf8');
const seenImports = new Set<string>();
const dedupedTheme = themeSource
  .split('\n')
  .filter((line) => {
    if (!line.startsWith('@import')) return true;
    const key = line.replaceAll('"', "'");
    if (seenImports.has(key)) return false;
    seenImports.add(key);
    return true;
  })
  .join('\n');
if (dedupedTheme !== themeSource) {
  writeFileSync(theme, dedupedTheme);
  console.log('removed duplicate @import lines from theme.css');
}
