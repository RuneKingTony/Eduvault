import type { CampusScope } from '../../common/campus-scope';
import type { RowArmFacts, StudentRowFacts } from './new-school-year';
import {
  NewSchoolYearRepository,
  type FirstTerm,
  type StartCalendar,
  type StartWrite,
  type StartWritten,
  type WaitingFacts,
  type YearPair,
} from './new-school-year.repository';

export class FakeNewSchoolYearRepository extends NewSchoolYearRepository {
  calendarFacts: StartCalendar | undefined;
  first: FirstTerm | undefined = {
    id: 'term-4',
    name: 'First term',
    isCurrent: false,
  };
  facts: WaitingFacts = {
    students: [],
    levels: [],
    arms: [],
    alreadyInTarget: 0,
  };
  waitingCount = 0;
  students: StudentRowFacts[] = [];
  arms: RowArmFacts[] = [];
  written: StartWrite[] = [];
  conflicts = 0;
  scopes: CampusScope[] = [];

  calendar(): Promise<StartCalendar | undefined> {
    return Promise.resolve(this.calendarFacts);
  }

  firstTerm(): Promise<FirstTerm | undefined> {
    return Promise.resolve(this.first);
  }

  waiting(
    _org: string,
    scope: CampusScope,
    _years: YearPair
  ): Promise<WaitingFacts> {
    this.scopes.push(scope);
    return Promise.resolve(this.facts);
  }

  countWaiting(): Promise<number> {
    return Promise.resolve(this.waitingCount);
  }

  studentFacts(
    _org: string,
    scope: CampusScope,
    input: { studentIds: readonly string[] }
  ): Promise<StudentRowFacts[]> {
    this.scopes.push(scope);
    return Promise.resolve(
      this.students.filter((student) =>
        input.studentIds.includes(student.studentId)
      )
    );
  }

  findArms(_org: string, ids: readonly string[]): Promise<RowArmFacts[]> {
    return Promise.resolve(this.arms.filter((arm) => ids.includes(arm.id)));
  }

  start(write: StartWrite): Promise<StartWritten> {
    this.written.push(write);
    const count = (outcome: 'move' | 'repeat') =>
      write.enrolments.filter((row) => row.outcome === outcome).length;
    return Promise.resolve({
      moved: count('move'),
      repeating: Math.max(count('repeat') - this.conflicts, 0),
      graduated: write.graduates.length,
    });
  }
}
