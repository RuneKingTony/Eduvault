import { parsePage } from './search-page';
import { STUDENT_TABS, type StudentTab } from '@eduvault/api-contract';
import { textOf } from '@eduvault/shared';

export interface StudentsSearch {
  tab?: StudentTab;
  q?: string;
  campusId?: string;
  levelId?: string;
  page?: number;
  admit?: 1;
  dialog?: 'start-year';
}

const tabOf = (value: unknown): StudentTab | undefined =>
  STUDENT_TABS.find((tab) => tab !== 'active' && tab === value);

/** Search params arrive as parsed JSON, so "123" may be the number 123; the default tab is left out. */
export function parseStudentsSearch(
  search: Record<string, unknown>
): StudentsSearch {
  return {
    tab: tabOf(search['tab']),
    q: textOf(search['q']),
    campusId: textOf(search['campusId']),
    levelId: textOf(search['levelId']),
    page: parsePage(search),
    admit: textOf(search['admit']) === '1' ? 1 : undefined,
    dialog: search['dialog'] === 'start-year' ? 'start-year' : undefined,
  };
}

interface StudentSearch {
  tab?: 'fees';
  dialog?: 'leave';
}

export function parseStudentSearch(
  search: Record<string, unknown>
): StudentSearch {
  return {
    tab: search['tab'] === 'fees' ? 'fees' : undefined,
    dialog: search['dialog'] === 'leave' ? 'leave' : undefined,
  };
}
