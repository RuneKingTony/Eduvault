import type { CampusScope } from '../../common/campus-scope';
import type {
  ArmFact,
  LevelFact,
  PlannedEnrolment,
  PlannedGraduate,
  RowArmFacts,
  StudentRowFacts,
  WaitingStudent,
  YearRange,
} from './new-school-year';

export interface StartCalendar {
  currentTerm: { termId: string; sessionId: string; sequence: number };
  lastSequence: number;
  years: YearRange[];
}

export interface FirstTerm {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface YearPair {
  leavingYearId: string;
  targetYearId: string;
  today: string;
}

export interface WaitingFacts {
  students: WaitingStudent[];
  levels: LevelFact[];
  arms: ArmFact[];
  alreadyInTarget: number;
}

export interface StartWrite {
  organizationId: string;
  actor: { id: string; name: string };
  currentTerm: { termId: string; sessionId: string };
  leavingYear: { id: string; name: string };
  targetYear: { id: string; name: string; firstTermId: string };
  enrolments: readonly PlannedEnrolment[];
  graduates: readonly PlannedGraduate[];
}

export interface StartWritten {
  moved: number;
  repeating: number;
  graduated: number;
}

export abstract class NewSchoolYearRepository {
  abstract calendar(organizationId: string): Promise<StartCalendar | undefined>;

  abstract firstTerm(
    organizationId: string,
    yearId: string
  ): Promise<FirstTerm | undefined>;

  abstract waiting(
    organizationId: string,
    scope: CampusScope,
    years: YearPair
  ): Promise<WaitingFacts>;

  abstract countWaiting(
    organizationId: string,
    scope: CampusScope,
    years: YearPair
  ): Promise<number>;

  abstract studentFacts(
    organizationId: string,
    scope: CampusScope,
    input: YearPair & { studentIds: readonly string[] }
  ): Promise<StudentRowFacts[]>;

  abstract findArms(
    organizationId: string,
    ids: readonly string[]
  ): Promise<RowArmFacts[]>;

  abstract start(write: StartWrite): Promise<StartWritten>;
}
