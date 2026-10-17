import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HOLIDAY_NOT_FOUND_MESSAGE,
  HOLIDAY_PAST_TERM_MESSAGE,
  SCHOOL_YEAR_NOT_FOUND_MESSAGE,
  SCHOOL_YEAR_PAGE_SIZE,
  TERM_ENDED_DATES_MESSAGE,
  TERM_ENDED_HOLIDAYS_MESSAGE,
  TERM_NOT_FOUND_MESSAGE,
  TERM_NOT_OFFERED_MESSAGE,
  YEAR_DATES_INVALID_MESSAGE,
  YEAR_OVERLAP_MESSAGE,
  YEAR_REFERENCED_MESSAGE,
  YEAR_TOO_SHORT_MESSAGE,
  holidayOutsideMessage,
  holidayStrandedMessage,
  holidayTakenMessage,
  holidayWeekendMessage,
  schoolYearExistsMessage,
  termOutsideYearMessage,
  termOverlapMessage,
  type CalendarCurrent,
  type CreateHolidayInput,
  type CreateSchoolYearInput,
  type CreatedSchoolYear,
  type DayOffEntry,
  type HolidayAdded,
  type HolidayRemoved,
  type SchoolYear,
  type SchoolYearList,
  type Term,
  type UpdateTermInput,
} from '@eduvault/api-contract';
import {
  canMakeCurrent,
  daysBetween,
  daysOff,
  isWeekend,
  schoolDaysSoFar,
  splitTerms,
  yearNameError,
  yearStartingNext,
} from '@eduvault/shared';
import type { OrgContext } from '../../common/auth';
import { Clock, schoolToday } from '../../common/clock';
import { SchoolLock } from '../../common/db/school-lock';
import {
  holidayDates,
  termEnded,
  toSchoolYearView,
  toTermView,
  type CalendarView,
} from './calendar-view';
import {
  CalendarRepository,
  type TermDetail,
  type TermRecord,
} from './calendar.repository';

const MIN_YEAR_DAYS = 84;

const yearNotFound = () => new NotFoundException(SCHOOL_YEAR_NOT_FOUND_MESSAGE);
const termNotFound = () => new NotFoundException(TERM_NOT_FOUND_MESSAGE);

function crossedSibling(
  term: TermRecord,
  dates: { startsOn: string; endsOn: string },
  siblings: readonly TermRecord[]
): TermRecord | undefined {
  return siblings
    .toSorted((a, b) => a.sequence - b.sequence)
    .find((sibling) =>
      sibling.sequence < term.sequence
        ? sibling.endsOn >= dates.startsOn
        : dates.endsOn >= sibling.startsOn
    );
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly calendar: CalendarRepository,
    private readonly clock: Clock,
    private readonly lock: SchoolLock
  ) {}

  private async loadView(ctx: OrgContext): Promise<CalendarView> {
    const [current, years] = await Promise.all([
      this.calendar.findCurrentTerm(ctx.organizationId),
      this.calendar.listYearRanges(ctx.organizationId),
    ]);
    return {
      today: schoolToday(ctx, this.clock),
      currentTerm: current?.term ?? null,
      years,
    };
  }

  private async loadYearsView(ctx: OrgContext): Promise<CalendarView> {
    const view = await this.loadView(ctx);
    const next =
      view.currentTerm === null
        ? undefined
        : yearStartingNext(view.years, view.currentTerm.sessionId);
    if (view.currentTerm === null || next === undefined) {
      return view;
    }
    const count = await this.calendar.countStudentsWaiting(ctx.organizationId, {
      fromYearId: view.currentTerm.sessionId,
      toYearId: next.id,
      today: view.today,
    });
    return { ...view, waiting: { yearId: next.id, count } };
  }

  private async termView(ctx: OrgContext, termId: string): Promise<Term> {
    const [detail, holidays, view] = await Promise.all([
      this.calendar.findTerm(ctx.organizationId, termId),
      this.calendar.holidaysByTerms(ctx.organizationId, [termId]),
      this.loadView(ctx),
    ]);
    if (detail === undefined) {
      throw termNotFound();
    }
    return toTermView(detail.term, holidays, view);
  }

  private async yearView(ctx: OrgContext, yearId: string): Promise<SchoolYear> {
    const year = await this.calendar.findYear(ctx.organizationId, yearId);
    if (year === undefined) {
      throw yearNotFound();
    }
    const [holidays, view] = await Promise.all([
      this.calendar.holidaysByTerms(
        ctx.organizationId,
        year.terms.map((term) => term.id)
      ),
      this.loadYearsView(ctx),
    ]);
    return toSchoolYearView(year, holidays, view);
  }

  private async requireTerm(
    ctx: OrgContext,
    termId: string
  ): Promise<TermDetail> {
    const detail = await this.calendar.findTerm(ctx.organizationId, termId);
    if (detail === undefined) {
      throw termNotFound();
    }
    return detail;
  }

  async list(ctx: OrgContext, page: number): Promise<SchoolYearList> {
    const { items, total } = await this.calendar.listYears(ctx.organizationId, {
      offset: (page - 1) * SCHOOL_YEAR_PAGE_SIZE,
      limit: SCHOOL_YEAR_PAGE_SIZE,
    });
    const [holidays, view] = await Promise.all([
      this.calendar.holidaysByTerms(
        ctx.organizationId,
        items.flatMap((year) => year.terms.map((term) => term.id))
      ),
      this.loadYearsView(ctx),
    ]);
    return {
      items: items.map((year) => toSchoolYearView(year, holidays, view)),
      total,
    };
  }

  get(ctx: OrgContext, id: string): Promise<SchoolYear> {
    return this.yearView(ctx, id);
  }

  private async assertNewYear(
    ctx: OrgContext,
    input: CreateSchoolYearInput
  ): Promise<void> {
    const nameError = yearNameError(input.name);
    if (nameError !== null) {
      throw new BadRequestException(nameError);
    }
    if (
      (await this.calendar.findYearByName(ctx.organizationId, input.name)) !==
      undefined
    ) {
      throw new ConflictException(schoolYearExistsMessage(input.name));
    }
    const length = daysBetween(input.startsOn, input.endsOn);
    if (length <= 0) {
      throw new BadRequestException(YEAR_DATES_INVALID_MESSAGE);
    }
    if (length < MIN_YEAR_DAYS) {
      throw new BadRequestException(YEAR_TOO_SHORT_MESSAGE);
    }
    if (
      await this.calendar.overlapsYear(
        ctx.organizationId,
        input.startsOn,
        input.endsOn
      )
    ) {
      throw new ConflictException(YEAR_OVERLAP_MESSAGE);
    }
  }

  create(
    ctx: OrgContext,
    input: CreateSchoolYearInput
  ): Promise<CreatedSchoolYear> {
    return this.lock.run(ctx.organizationId, async () => {
      await this.assertNewYear(ctx, input);
      const current = await this.calendar.findCurrentTerm(ctx.organizationId);
      const madeCurrent = current === undefined;
      const createdId = await this.calendar.insertYear(ctx.organizationId, {
        year: input,
        terms: splitTerms(input.startsOn, input.endsOn),
        firstTermCurrent: madeCurrent,
      });
      return { ...(await this.yearView(ctx, createdId)), madeCurrent };
    });
  }

  makeCurrent(ctx: OrgContext, termId: string): Promise<Term> {
    return this.lock.run(ctx.organizationId, async () => {
      const { term } = await this.requireTerm(ctx, termId);
      if (!term.isCurrent) {
        const view = await this.loadView(ctx);
        if (!canMakeCurrent(term, view)) {
          throw new ConflictException(TERM_NOT_OFFERED_MESSAGE);
        }
        await this.calendar.setCurrent(ctx.organizationId, term.id);
      }
      return this.termView(ctx, termId);
    });
  }

  private assertEditableDates(
    detail: TermDetail,
    dates: { startsOn: string; endsOn: string },
    holidays: readonly { date: string }[]
  ): void {
    const { term, year, siblings } = detail;
    if (dates.endsOn < dates.startsOn) {
      throw new BadRequestException(YEAR_DATES_INVALID_MESSAGE);
    }
    if (dates.startsOn < year.startsOn || dates.endsOn > year.endsOn) {
      throw new BadRequestException(termOutsideYearMessage(year));
    }
    const crossed = crossedSibling(term, dates, siblings);
    if (crossed !== undefined) {
      throw new BadRequestException(termOverlapMessage(crossed.name));
    }
    const stranded = holidays.find(
      (holiday) => holiday.date < dates.startsOn || holiday.date > dates.endsOn
    );
    if (stranded !== undefined) {
      throw new BadRequestException(holidayStrandedMessage(stranded.date));
    }
  }

  updateTerm(
    ctx: OrgContext,
    termId: string,
    input: UpdateTermInput
  ): Promise<Term> {
    return this.lock.run(ctx.organizationId, async () => {
      const detail = await this.requireTerm(ctx, termId);
      if (termEnded(detail.term, schoolToday(ctx, this.clock))) {
        throw new ConflictException(TERM_ENDED_DATES_MESSAGE);
      }
      const dates = {
        startsOn: input.startsOn ?? detail.term.startsOn,
        endsOn: input.endsOn ?? detail.term.endsOn,
      };
      const holidays = await this.calendar.holidaysByTerms(ctx.organizationId, [
        termId,
      ]);
      this.assertEditableDates(
        detail,
        dates,
        holidays.toSorted((a, b) => a.date.localeCompare(b.date))
      );
      await this.calendar.updateTermDates(ctx.organizationId, termId, dates);
      return this.termView(ctx, termId);
    });
  }

  private async assertNewHoliday(
    ctx: OrgContext,
    term: TermRecord,
    input: CreateHolidayInput
  ): Promise<void> {
    if (termEnded(term, schoolToday(ctx, this.clock))) {
      throw new BadRequestException(HOLIDAY_PAST_TERM_MESSAGE);
    }
    if (input.date < term.startsOn || input.date > term.endsOn) {
      throw new BadRequestException(holidayOutsideMessage(term));
    }
    if (isWeekend(input.date)) {
      throw new BadRequestException(holidayWeekendMessage(input.date));
    }
    const taken = await this.calendar.findHolidayByDate(
      ctx.organizationId,
      input.date
    );
    if (taken !== undefined) {
      throw new ConflictException(holidayTakenMessage(input.date, taken.name));
    }
  }

  addHoliday(
    ctx: OrgContext,
    termId: string,
    input: CreateHolidayInput
  ): Promise<HolidayAdded> {
    return this.lock.run(ctx.organizationId, async () => {
      const { term } = await this.requireTerm(ctx, termId);
      await this.assertNewHoliday(ctx, term, input);
      const holiday = await this.calendar.insertHoliday(
        ctx.organizationId,
        termId,
        { date: input.date, name: input.name.trim() }
      );
      return { holiday, term: await this.termView(ctx, termId) };
    });
  }

  removeHoliday(ctx: OrgContext, id: string): Promise<HolidayRemoved> {
    return this.lock.run(ctx.organizationId, async () => {
      const holiday = await this.calendar.findHoliday(ctx.organizationId, id);
      if (holiday === undefined) {
        throw new NotFoundException(HOLIDAY_NOT_FOUND_MESSAGE);
      }
      const { term } = await this.requireTerm(ctx, holiday.termId);
      if (termEnded(term, schoolToday(ctx, this.clock))) {
        throw new ConflictException(TERM_ENDED_HOLIDAYS_MESSAGE);
      }
      await this.calendar.deleteHoliday(ctx.organizationId, id);
      return { id, term: await this.termView(ctx, term.id) };
    });
  }

  remove(ctx: OrgContext, id: string): Promise<{ id: string }> {
    return this.lock.run(ctx.organizationId, async () => {
      const year = await this.yearView(ctx, id);
      if (year.deletable.reason !== null) {
        throw new ConflictException(year.deletable.reason);
      }
      const result = await this.calendar.deleteYear(ctx.organizationId, id);
      if (result === 'referenced') {
        throw new ConflictException(YEAR_REFERENCED_MESSAGE);
      }
      return { id };
    });
  }

  async current(ctx: OrgContext): Promise<CalendarCurrent> {
    const current = await this.calendar.findCurrentTerm(ctx.organizationId);
    if (current === undefined) {
      return {
        term: null,
        schoolYear: null,
        schoolDays: 0,
        schoolDaysSoFar: 0,
      };
    }
    const [holidays, view] = await Promise.all([
      this.calendar.holidaysByTerms(ctx.organizationId, [current.term.id]),
      this.loadView(ctx),
    ]);
    const term = toTermView(current.term, holidays, view);
    return {
      term,
      schoolYear: current.year,
      schoolDays: term.schoolDays,
      schoolDaysSoFar: schoolDaysSoFar(
        term,
        holidayDates(holidays),
        view.today
      ),
    };
  }

  async holidayDates(organizationId: string): Promise<string[]> {
    const holidays = await this.calendar.listHolidays(organizationId);
    return holidays.map((holiday) => holiday.date);
  }

  async daysOff(ctx: OrgContext, limit: number): Promise<DayOffEntry[]> {
    const [terms, holidays] = await Promise.all([
      this.calendar.listTerms(ctx.organizationId),
      this.calendar.listHolidays(ctx.organizationId),
    ]);
    return daysOff({
      terms,
      holidays,
      today: schoolToday(ctx, this.clock),
      limit,
    });
  }
}
