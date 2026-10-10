import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  CalendarRepository,
  type HolidayRecord,
  type NewYearInsert,
  type Page,
  type SchoolYearRecord,
  type SchoolYearWithTerms,
  type TermDetail,
  type TermRecord,
} from './calendar.repository';

const PG_FOREIGN_KEY_VIOLATION = '23503';

interface YearRow {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
}

interface TermRow {
  id: string;
  session_id: string;
  sequence: number;
  name: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
}

interface HolidayRow {
  id: string;
  term_id: string;
  date: string;
  name: string;
}

const toSchoolYear = (row: YearRow): SchoolYearRecord => ({
  id: row.id,
  name: row.name,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
});

const toTerm = (row: TermRow): TermRecord => ({
  id: row.id,
  sessionId: row.session_id,
  sequence: row.sequence,
  name: row.name,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  isCurrent: row.is_current,
});

const toHoliday = (row: HolidayRow): HolidayRecord => ({
  id: row.id,
  termId: row.term_id,
  date: row.date,
  name: row.name,
});

const day = (column: string) =>
  sql<string>`to_char(${sql.ref(column)}, 'YYYY-MM-DD')`;

const isForeignKeyViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === PG_FOREIGN_KEY_VIOLATION;

const groupTerms = (
  years: readonly SchoolYearRecord[],
  terms: readonly TermRecord[]
): SchoolYearWithTerms[] =>
  years.map((year) => ({
    ...year,
    terms: terms.filter((term) => term.sessionId === year.id),
  }));

@Injectable()
export class KyselyCalendarRepository extends CalendarRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  private years(organizationId: string) {
    return this.db
      .selectFrom('academic_session')
      .where('academic_session.organization_id', '=', organizationId)
      .select([
        'academic_session.id',
        'academic_session.name',
        day('academic_session.starts_on').as('starts_on'),
        day('academic_session.ends_on').as('ends_on'),
      ]);
  }

  private terms(organizationId: string) {
    return this.db
      .selectFrom('term')
      .where('term.organization_id', '=', organizationId)
      .select([
        'term.id',
        'term.session_id',
        'term.sequence',
        'term.name',
        'term.is_current',
        day('term.starts_on').as('starts_on'),
        day('term.ends_on').as('ends_on'),
      ]);
  }

  private holidays(organizationId: string) {
    return this.db
      .selectFrom('school_holiday')
      .where('school_holiday.organization_id', '=', organizationId)
      .select([
        'school_holiday.id',
        'school_holiday.term_id',
        'school_holiday.name',
        day('school_holiday.date').as('date'),
      ]);
  }

  private async termsOfYears(
    organizationId: string,
    yearIds: readonly string[]
  ): Promise<TermRecord[]> {
    if (yearIds.length === 0) {
      return [];
    }
    const rows = await this.terms(organizationId)
      .where('term.session_id', 'in', yearIds)
      .orderBy('term.sequence')
      .execute();
    return rows.map((row) => toTerm(row));
  }

  async listYears(
    organizationId: string,
    page: Page
  ): Promise<{ items: SchoolYearWithTerms[]; total: number }> {
    const [rows, count] = await Promise.all([
      this.years(organizationId)
        .orderBy('academic_session.starts_on', 'desc')
        .orderBy('academic_session.id')
        .offset(page.offset)
        .limit(page.limit)
        .execute(),
      this.db
        .selectFrom('academic_session')
        .where('organization_id', '=', organizationId)
        .select(sql<number>`count(*)::int`.as('total'))
        .executeTakeFirstOrThrow(),
    ]);
    const years = rows.map((row) => toSchoolYear(row));
    const terms = await this.termsOfYears(
      organizationId,
      years.map((year) => year.id)
    );
    return { items: groupTerms(years, terms), total: count.total };
  }

  async listYearRanges(organizationId: string): Promise<SchoolYearRecord[]> {
    const rows = await this.years(organizationId)
      .orderBy('academic_session.starts_on')
      .execute();
    return rows.map((row) => toSchoolYear(row));
  }

  async findYear(
    organizationId: string,
    id: string
  ): Promise<SchoolYearWithTerms | undefined> {
    const row = await this.years(organizationId)
      .where('academic_session.id', '=', id)
      .executeTakeFirst();
    if (row === undefined) {
      return undefined;
    }
    const terms = await this.termsOfYears(organizationId, [row.id]);
    return { ...toSchoolYear(row), terms };
  }

  async findYearByName(
    organizationId: string,
    name: string
  ): Promise<SchoolYearRecord | undefined> {
    const row = await this.years(organizationId)
      .where('academic_session.name', '=', name)
      .executeTakeFirst();
    return row && toSchoolYear(row);
  }

  async overlapsYear(
    organizationId: string,
    startsOn: string,
    endsOn: string
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('academic_session')
      .where('organization_id', '=', organizationId)
      .where(
        sql<boolean>`daterange(starts_on, ends_on, '[]') && daterange(${startsOn}::date, ${endsOn}::date, '[]')`
      )
      .select('id')
      .executeTakeFirst();
    return row !== undefined;
  }

  async findTerm(
    organizationId: string,
    id: string
  ): Promise<TermDetail | undefined> {
    const row = await this.terms(organizationId)
      .where('term.id', '=', id)
      .executeTakeFirst();
    if (row === undefined) {
      return undefined;
    }
    const year = await this.years(organizationId)
      .where('academic_session.id', '=', row.session_id)
      .executeTakeFirstOrThrow();
    const siblings = await this.termsOfYears(organizationId, [row.session_id]);
    return {
      term: toTerm(row),
      year: toSchoolYear(year),
      siblings: siblings.filter((sibling) => sibling.id !== row.id),
    };
  }

  async findCurrentTerm(
    organizationId: string
  ): Promise<{ term: TermRecord; year: SchoolYearRecord } | undefined> {
    const row = await this.terms(organizationId)
      .where('term.is_current', '=', true)
      .executeTakeFirst();
    if (row === undefined) {
      return undefined;
    }
    const year = await this.years(organizationId)
      .where('academic_session.id', '=', row.session_id)
      .executeTakeFirstOrThrow();
    return { term: toTerm(row), year: toSchoolYear(year) };
  }

  async listTerms(organizationId: string): Promise<TermRecord[]> {
    const rows = await this.terms(organizationId)
      .orderBy('term.starts_on')
      .execute();
    return rows.map((row) => toTerm(row));
  }

  async holidaysByTerms(
    organizationId: string,
    termIds: readonly string[]
  ): Promise<HolidayRecord[]> {
    if (termIds.length === 0) {
      return [];
    }
    const rows = await this.holidays(organizationId)
      .where('school_holiday.term_id', 'in', termIds)
      .orderBy('school_holiday.date')
      .execute();
    return rows.map((row) => toHoliday(row));
  }

  async listHolidays(organizationId: string): Promise<HolidayRecord[]> {
    const rows = await this.holidays(organizationId)
      .orderBy('school_holiday.date')
      .execute();
    return rows.map((row) => toHoliday(row));
  }

  async findHoliday(
    organizationId: string,
    id: string
  ): Promise<HolidayRecord | undefined> {
    const row = await this.holidays(organizationId)
      .where('school_holiday.id', '=', id)
      .executeTakeFirst();
    return row && toHoliday(row);
  }

  async findHolidayByDate(
    organizationId: string,
    date: string
  ): Promise<HolidayRecord | undefined> {
    const row = await this.holidays(organizationId)
      .where(sql<boolean>`school_holiday.date = ${date}::date`)
      .executeTakeFirst();
    return row && toHoliday(row);
  }

  async insertYear(
    organizationId: string,
    { year, terms, firstTermCurrent }: NewYearInsert
  ): Promise<string> {
    return this.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('academic_session')
        .values({
          organization_id: organizationId,
          name: year.name,
          starts_on: year.startsOn,
          ends_on: year.endsOn,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('term')
        .values(
          terms.map((term) => ({
            organization_id: organizationId,
            session_id: created.id,
            sequence: term.sequence,
            name: term.name,
            starts_on: term.startsOn,
            ends_on: term.endsOn,
            is_current: firstTermCurrent && term.sequence === 1,
          }))
        )
        .execute();
      return created.id;
    });
  }

  async setCurrent(organizationId: string, termId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('term')
        .set({ is_current: false, updated_at: new Date() })
        .where('organization_id', '=', organizationId)
        .where('is_current', '=', true)
        .execute();
      await trx
        .updateTable('term')
        .set({ is_current: true, updated_at: new Date() })
        .where('organization_id', '=', organizationId)
        .where('id', '=', termId)
        .execute();
    });
  }

  async updateTermDates(
    organizationId: string,
    termId: string,
    dates: { startsOn: string; endsOn: string }
  ): Promise<void> {
    await this.db
      .updateTable('term')
      .set({
        starts_on: dates.startsOn,
        ends_on: dates.endsOn,
        updated_at: new Date(),
      })
      .where('organization_id', '=', organizationId)
      .where('id', '=', termId)
      .execute();
  }

  async insertHoliday(
    organizationId: string,
    termId: string,
    holiday: { date: string; name: string }
  ): Promise<HolidayRecord> {
    const row = await this.db
      .insertInto('school_holiday')
      .values({
        organization_id: organizationId,
        term_id: termId,
        date: holiday.date,
        name: holiday.name,
      })
      .returning(['id', 'term_id', 'name', day('date').as('date')])
      .executeTakeFirstOrThrow();
    return toHoliday(row);
  }

  async deleteHoliday(organizationId: string, id: string): Promise<void> {
    await this.db
      .deleteFrom('school_holiday')
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .execute();
  }

  async deleteYear(
    organizationId: string,
    id: string
  ): Promise<'deleted' | 'referenced'> {
    try {
      await this.db
        .deleteFrom('academic_session')
        .where('organization_id', '=', organizationId)
        .where('id', '=', id)
        .execute();
      return 'deleted';
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'referenced';
      }
      throw error;
    }
  }
}
