import { pageOf as pageParamOf } from '@eduvault/shared';

export const SUBJECT_TABS = ['catalogue', 'by-level', 'teachers'] as const;
export type SubjectTab = (typeof SUBJECT_TABS)[number];

interface SubjectsSearch {
  tab?: Exclude<SubjectTab, 'catalogue'>;
  page?: number;
}

export function parseSubjectsSearch(
  search: Record<string, unknown>
): SubjectsSearch {
  const tab = search['tab'];
  return {
    tab: tab === 'by-level' || tab === 'teachers' ? tab : undefined,
    page: pageParamOf(search['page']),
  };
}

export const tabOf = (search: SubjectsSearch): SubjectTab =>
  search.tab ?? 'catalogue';

export const pageOf = (search: SubjectsSearch): number => search.page ?? 1;
