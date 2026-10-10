export interface SchoolYearRecord {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface TermRecord {
  id: string;
  sessionId: string;
  sequence: number;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export interface HolidayRecord {
  id: string;
  termId: string;
  date: string;
  name: string;
}

export interface SchoolYearWithTerms extends SchoolYearRecord {
  terms: TermRecord[];
}

export interface TermDetail {
  term: TermRecord;
  year: SchoolYearRecord;
  siblings: TermRecord[];
}

export interface NewSchoolYear {
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface NewYearInsert {
  year: NewSchoolYear;
  terms: readonly NewTerm[];
  firstTermCurrent: boolean;
}

export interface NewTerm {
  sequence: number;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface Page {
  offset: number;
  limit: number;
}

export abstract class CalendarRepository {
  abstract listYears(
    organizationId: string,
    page: Page
  ): Promise<{ items: SchoolYearWithTerms[]; total: number }>;

  abstract listYearRanges(organizationId: string): Promise<SchoolYearRecord[]>;

  abstract findYear(
    organizationId: string,
    id: string
  ): Promise<SchoolYearWithTerms | undefined>;

  abstract findYearByName(
    organizationId: string,
    name: string
  ): Promise<SchoolYearRecord | undefined>;

  abstract overlapsYear(
    organizationId: string,
    startsOn: string,
    endsOn: string
  ): Promise<boolean>;

  abstract findTerm(
    organizationId: string,
    id: string
  ): Promise<TermDetail | undefined>;

  abstract findCurrentTerm(
    organizationId: string
  ): Promise<{ term: TermRecord; year: SchoolYearRecord } | undefined>;

  abstract listTerms(organizationId: string): Promise<TermRecord[]>;

  abstract holidaysByTerms(
    organizationId: string,
    termIds: readonly string[]
  ): Promise<HolidayRecord[]>;

  abstract listHolidays(organizationId: string): Promise<HolidayRecord[]>;

  abstract findHoliday(
    organizationId: string,
    id: string
  ): Promise<HolidayRecord | undefined>;

  abstract findHolidayByDate(
    organizationId: string,
    date: string
  ): Promise<HolidayRecord | undefined>;

  abstract insertYear(
    organizationId: string,
    input: NewYearInsert
  ): Promise<string>;

  abstract setCurrent(organizationId: string, termId: string): Promise<void>;

  abstract updateTermDates(
    organizationId: string,
    termId: string,
    dates: { startsOn: string; endsOn: string }
  ): Promise<void>;

  abstract insertHoliday(
    organizationId: string,
    termId: string,
    holiday: { date: string; name: string }
  ): Promise<HolidayRecord>;

  abstract deleteHoliday(organizationId: string, id: string): Promise<void>;

  /** `referenced` when a foreign key from another table refuses the delete. */
  abstract deleteYear(
    organizationId: string,
    id: string
  ): Promise<'deleted' | 'referenced'>;
}
