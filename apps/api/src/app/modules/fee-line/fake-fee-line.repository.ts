import type {
  FeeCandidates,
  FeeLine,
  FeeSetup,
  FeeType,
} from '@eduvault/api-contract';
import { canSeeCampus } from '../../common/campus-scope';
import {
  FeeLineRepository,
  FeeOptionRepository,
  FeeStudentRepository,
  FeeTypeRepository,
  type ChargeFacts,
  type CopyFeeLines,
  type CopyOutcome,
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
  otherAccounts = new Set<string>();
  created: NewFeeLine[] = [];
  copies: CopyFeeLines[] = [];
  duplicate = false;
  setupResult: FeeSetup = { terms: [], levels: [] };

  private live(termId: string): FeeLine[] {
    return this.rows.filter(
      (row) => row.termId === termId && row.retiredAt === null
    );
  }

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

  previousTerm(
    _organizationId: string,
    termId: string
  ): Promise<TermRef | undefined> {
    const target = this.terms.get(termId);
    const earlier = [...this.terms.values()]
      .filter((term) => target !== undefined && term.startsOn < target.startsOn)
      .toSorted((a, b) => b.startsOn.localeCompare(a.startsOn));
    return Promise.resolve(earlier[0]);
  }

  liveLineCount(_organizationId: string, termId: string): Promise<number> {
    return Promise.resolve(this.live(termId).length);
  }

  copyLines(input: CopyFeeLines): Promise<CopyOutcome> {
    this.copies.push(input);
    if (this.live(input.toTermId).length > 0) {
      return Promise.resolve({ status: 'not_empty' });
    }
    const source = this.live(input.fromTermId);
    if (source.length === 0) {
      return Promise.resolve({ status: 'source_empty' });
    }
    this.rows.push(
      ...source.map((row, index) => ({
        ...row,
        id: `copy-${this.copies.length}-${index + 1}`,
        termId: input.toTermId,
        createdAt: '2026-10-15T00:00:00.000Z',
      }))
    );
    return Promise.resolve({ status: 'copied', copied: source.length });
  }

  findFeeType(
    _organizationId: string,
    id: string
  ): Promise<FeeType | undefined> {
    return Promise.resolve(this.feeTypes.get(id));
  }

  hasLedgerAccount(_organizationId: string, id: string): Promise<boolean> {
    return Promise.resolve(this.feeTypes.has(id) || this.otherAccounts.has(id));
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

  setup(): Promise<FeeSetup> {
    return Promise.resolve(this.setupResult);
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

export class FakeFeeStudentRepository extends FeeStudentRepository {
  student: StudentFeeContext | undefined;
  candidateList: FeeCandidates = { items: [], total: 0 };
  facts: ChargeFacts = {
    charged: null,
    discounts: [],
    term: { sessionStartsOn: '2026-09-07', sequence: 1 },
    discountsAccountId: 'discounts-given',
  };

  findStudent(): Promise<StudentFeeContext | undefined> {
    return Promise.resolve(this.student);
  }

  chargeFacts(): Promise<ChargeFacts> {
    return Promise.resolve(this.facts);
  }

  candidates(): Promise<FeeCandidates> {
    return Promise.resolve(this.candidateList);
  }
}

export class FakeFeeOptionRepository extends FeeOptionRepository {
  session: string | undefined = 'session-1';
  sessions = new Set(['session-1']);
  optedIn: string[] = [];
  optional: { feeTypeId: string; name: string }[] = [];
  changes: OptionChange[] = [];

  hasSession(_organizationId: string, id: string): Promise<boolean> {
    return Promise.resolve(this.sessions.has(id));
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
