import type { FeeCandidates, FeeLine, FeeType } from '@eduvault/api-contract';
import { canSeeCampus } from '../../common/campus-scope';
import {
  FeeLineRepository,
  FeeOptionRepository,
  FeeTypeRepository,
  type FeeLineOutcome,
  type FeeScope,
  type FeeTypeOutcome,
  type LevelRef,
  type NewFeeLine,
  type OptionChange,
  type StudentFeeContext,
  type TermRef,
} from './fee-line.repository';

export class FakeFeeLineRepository extends FeeLineRepository {
  rows: FeeLine[] = [];
  terms = new Map<string, TermRef>();
  levels = new Map<string, LevelRef>();
  feeTypes = new Map<string, FeeType>();
  created: NewFeeLine[] = [];
  duplicate = false;

  private visible(scope: FeeScope): FeeLine[] {
    return this.rows.filter(
      (row) =>
        row.campusId === null || canSeeCampus(scope.campusScope, row.campusId)
    );
  }

  list(
    scope: FeeScope,
    query: { termId: string; includeRetired: boolean }
  ): Promise<FeeLine[]> {
    return Promise.resolve(
      this.visible(scope).filter(
        (row) =>
          row.termId === query.termId &&
          (query.includeRetired || row.retiredAt === null)
      )
    );
  }

  findById(scope: FeeScope, id: string): Promise<FeeLine | undefined> {
    return Promise.resolve(this.visible(scope).find((row) => row.id === id));
  }

  findTerm(
    _organizationId: string,
    termId: string
  ): Promise<TermRef | undefined> {
    return Promise.resolve(this.terms.get(termId));
  }

  findFeeType(
    _organizationId: string,
    id: string
  ): Promise<FeeType | undefined> {
    return Promise.resolve(this.feeTypes.get(id));
  }

  findLevel(
    _organizationId: string,
    id: string
  ): Promise<LevelRef | undefined> {
    return Promise.resolve(this.levels.get(id));
  }

  currency(): Promise<string> {
    return Promise.resolve('NGN');
  }

  create(input: NewFeeLine): Promise<FeeLineOutcome> {
    this.created.push(input);
    if (this.duplicate) {
      return Promise.resolve({ status: 'duplicate' });
    }
    const line: FeeLine = {
      id: `line-${this.created.length}`,
      termId: input.termId,
      classLevelId: input.classLevelId,
      levelName: this.levels.get(input.classLevelId)?.name ?? '',
      levelSequence: 1,
      feeTypeId: input.feeTypeId,
      feeTypeCode: 4010,
      feeTypeName: this.feeTypes.get(input.feeTypeId)?.name ?? '',
      campusId: input.campusId,
      campusName: null,
      name: input.name,
      amountMinor: input.amountMinor,
      appliesTo: input.appliesTo,
      isOptional: input.isOptional,
      retiredAt: null,
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    this.rows.push(line);
    return Promise.resolve({ status: 'saved', line });
  }

  updateAmount(
    _organizationId: string,
    id: string,
    amountMinor: number
  ): Promise<FeeLine | undefined> {
    const row = this.rows.find(
      (candidate) => candidate.id === id && candidate.retiredAt === null
    );
    if (row === undefined) {
      return Promise.resolve(undefined);
    }
    row.amountMinor = amountMinor;
    return Promise.resolve(row);
  }

  retire(_organizationId: string, id: string): Promise<FeeLine | undefined> {
    const row = this.rows.find(
      (candidate) => candidate.id === id && candidate.retiredAt === null
    );
    if (row === undefined) {
      return Promise.resolve(undefined);
    }
    row.retiredAt = '2026-10-05T00:00:00.000Z';
    return Promise.resolve(row);
  }
}

export class FakeFeeTypeRepository extends FeeTypeRepository {
  types: FeeType[] = [];
  outcome: FeeTypeOutcome | undefined;
  createdNames: string[] = [];

  list(): Promise<FeeType[]> {
    return Promise.resolve(this.types);
  }

  create(_organizationId: string, name: string): Promise<FeeTypeOutcome> {
    this.createdNames.push(name);
    return Promise.resolve(
      this.outcome ?? {
        status: 'saved',
        feeType: { id: 'new-type', code: 4090, name },
      }
    );
  }
}

export class FakeFeeOptionRepository extends FeeOptionRepository {
  student: StudentFeeContext | undefined;
  session: string | undefined = 'session-1';
  optedIn: string[] = [];
  candidateList: FeeCandidates = { items: [], total: 0 };
  optional: { feeTypeId: string; name: string }[] = [];
  changes: OptionChange[] = [];

  findStudent(): Promise<StudentFeeContext | undefined> {
    return Promise.resolve(this.student);
  }

  candidates(): Promise<FeeCandidates> {
    return Promise.resolve(this.candidateList);
  }

  currentSessionId(): Promise<string | undefined> {
    return Promise.resolve(this.session);
  }

  optedInFeeTypeIds(): Promise<string[]> {
    return Promise.resolve(this.optedIn);
  }

  optionalFeeTypes(): Promise<{ feeTypeId: string; name: string }[]> {
    return Promise.resolve(this.optional);
  }

  setOption(change: OptionChange): Promise<void> {
    this.changes.push(change);
    return Promise.resolve();
  }
}
