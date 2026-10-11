import type { ClassStatus } from '@eduvault/api-contract';

interface ClassesSearch {
  status?: Exclude<ClassStatus, 'active'>;
}

export function parseClassesSearch(
  search: Record<string, unknown>
): ClassesSearch {
  const status = search['status'];
  return {
    status: status === 'archived' || status === 'all' ? status : undefined,
  };
}

export const statusOf = (search: ClassesSearch): ClassStatus =>
  search.status ?? 'active';
