const NO_ROLES = 'Member, no roles';

export function roleLabels(role: string | null | undefined): string {
  const labels = (role ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '' && name !== 'member')
    .map((name) => `${name.slice(0, 1).toUpperCase()}${name.slice(1)}`);
  return labels.length === 0 ? NO_ROLES : labels.join(', ');
}
