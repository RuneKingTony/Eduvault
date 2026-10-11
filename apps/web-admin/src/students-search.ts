import { STUDENT_TABS, type StudentTab } from '@eduvault/api-contract';

export interface StudentsSearch {
  tab?: StudentTab;
  q?: string;
  campusId?: string;
  levelId?: string;
  page?: number;
  admit?: 1;
  dialog?: 'start-year';
}

const textOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const text = String(value).trim();
  return text === '' ? undefined : text;
};

const tabOf = (value: unknown): StudentTab | undefined =>
  STUDENT_TABS.find((tab) => tab !== 'active' && tab === value);

/** Search params arrive as parsed JSON, so "123" may be the number 123; the default tab is left out. */
export function parseStudentsSearch(
  search: Record<string, unknown>
): StudentsSearch {
  const page = Number(search['page']);
  return {
    tab: tabOf(search['tab']),
    q: textOf(search['q']),
    campusId: textOf(search['campusId']),
    levelId: textOf(search['levelId']),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    admit: textOf(search['admit']) === '1' ? 1 : undefined,
    dialog: search['dialog'] === 'start-year' ? 'start-year' : undefined,
  };
}

interface StudentSearch {
  dialog?: 'leave';
}

export function parseStudentSearch(
  search: Record<string, unknown>
): StudentSearch {
  return { dialog: search['dialog'] === 'leave' ? 'leave' : undefined };
}
