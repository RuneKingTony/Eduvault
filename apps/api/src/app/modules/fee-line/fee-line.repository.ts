import type {
  FeeAppliesTo,
  FeeCandidates,
  FeeLine,
  FeeOption,
  FeeSetup,
  FeeType,
} from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';
import type { DiscountFacts, TermPosition } from '../../common/fees';

export interface FeeScope {
  organizationId: string;
  campusScope: CampusScope;
}

export interface TermRef {
  id: string;
  sessionId: string;
  endsOn: string;
}

export interface LevelRef {
  id: string;
  name: string;
}

export interface NewFeeLine {
  organizationId: string;
  userId: string;
  termId: string;
  classLevelId: string;
  feeTypeId: string;
  campusId: string | null;
  name: string;
  amountMinor: number;
  appliesTo: FeeAppliesTo;
  isOptional: boolean;
}

export type FeeLineOutcome =
  { status: 'saved'; line: FeeLine } | { status: 'duplicate' };

export type FeeTypeOutcome =
  | { status: 'saved'; feeType: FeeType }
  | { status: 'name_taken' }
  | { status: 'code_taken' };

export abstract class FeeLineRepository {
  abstract list(
    scope: FeeScope,
    query: { termId: string; includeRetired: boolean }
  ): Promise<FeeLine[]>;

  abstract findById(scope: FeeScope, id: string): Promise<FeeLine | undefined>;

  abstract findTerm(
    organizationId: string,
    termId: string
  ): Promise<TermRef | undefined>;

  abstract currency(organizationId: string): Promise<string>;

  abstract setup(organizationId: string): Promise<FeeSetup>;

  abstract findFeeType(
    organizationId: string,
    id: string
  ): Promise<FeeType | undefined>;

  abstract hasLedgerAccount(
    organizationId: string,
    id: string
  ): Promise<boolean>;

  abstract findLevel(
    organizationId: string,
    id: string
  ): Promise<LevelRef | undefined>;

  abstract create(input: NewFeeLine): Promise<FeeLineOutcome>;

  abstract updateAmount(
    organizationId: string,
    id: string,
    amountMinor: number
  ): Promise<FeeLine | undefined>;

  abstract retire(
    organizationId: string,
    id: string
  ): Promise<FeeLine | undefined>;
}

export abstract class FeeTypeRepository {
  abstract list(organizationId: string): Promise<FeeType[]>;

  abstract create(
    organizationId: string,
    name: string
  ): Promise<FeeTypeOutcome>;
}

export interface StudentFeeContext {
  studentId: string;
  name: string;
  homeCampusId: string;
  homeCampusName: string;
  enrollment: {
    id: string;
    classLevelId: string;
    levelName: string;
    isNew: boolean;
  } | null;
  placement: {
    armName: string;
    campusId: string;
    campusName: string;
  } | null;
  latestPlacement: { campusId: string; campusName: string } | null;
}

export interface OptionChange {
  organizationId: string;
  userId: string;
  enrollmentId: string;
  feeTypeId: string;
  optedIn: boolean;
}

export interface ChargeFacts {
  charged: { status: 'draft' | 'sent'; number: string | null } | null;
  discounts: DiscountFacts[];
  term: TermPosition;
  discountsAccountId: string;
}

export abstract class FeeStudentRepository {
  /** Undefined unless the student is on a campus in the caller's scope; class scope never applies to finance. */
  abstract findStudent(
    scope: FeeScope,
    query: {
      studentId: string;
      sessionId: string | undefined;
      termId?: string;
    }
  ): Promise<StudentFeeContext | undefined>;

  abstract chargeFacts(
    organizationId: string,
    query: { studentId: string; termId: string }
  ): Promise<ChargeFacts>;

  abstract candidates(
    scope: FeeScope,
    query: { sessionId: string; q: string | undefined }
  ): Promise<FeeCandidates>;
}

export abstract class FeeOptionRepository {
  abstract hasSession(organizationId: string, id: string): Promise<boolean>;

  abstract currentSessionId(
    organizationId: string
  ): Promise<string | undefined>;

  abstract optedInFeeTypeIds(
    organizationId: string,
    enrollmentId: string
  ): Promise<string[]>;

  abstract optionalFeeTypes(
    organizationId: string,
    query: {
      sessionId: string;
      classLevelId: string;
      enrollmentId: string;
      homeCampusId: string;
    }
  ): Promise<Pick<FeeOption, 'feeTypeId' | 'name'>[]>;

  abstract setOption(change: OptionChange): Promise<void>;
}
