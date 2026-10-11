const TITLES = new Set(['mr', 'mrs', 'ms', 'dr', 'chief', 'alhaji', 'alhaja']);
const MAX_BASE = 60;

function letterRuns(text: string): string[] {
  const runs: string[] = [];
  let current = '';
  for (const char of text.toLowerCase()) {
    if (char >= 'a' && char <= 'z') {
      current += char;
    } else if (current !== '') {
      runs.push(current);
      current = '';
    }
  }
  return current === '' ? runs : [...runs, current];
}

export function guardianUsernameBase(fullName: string): string {
  const [first = '', ...rest] = letterRuns(fullName);
  const runs = TITLES.has(first) ? rest : [first, ...rest];
  let letters = runs.join('-').slice(0, MAX_BASE);
  while (letters.endsWith('-')) {
    letters = letters.slice(0, -1);
  }
  return `${letters === '' ? 'guardian' : letters}-family`;
}

export function firstFreeUsername(
  base: string,
  taken: ReadonlySet<string>
): string {
  let suffix = 2;
  let candidate = base;
  while (taken.has(candidate)) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}
