export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => String.fromCodePoint(word.codePointAt(0) ?? 0).toUpperCase())
    .join('');
}
