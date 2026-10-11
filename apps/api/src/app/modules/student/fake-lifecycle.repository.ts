import type { ActivityInput } from '../../common/activity';
import type { GraduatingStudent } from '../../common/students';
import type { CurrentTerm } from './admission.repository';
import {
  LifecycleRepository,
  type EnrolmentFacts,
  type LeavingWrite,
  type LifecycleStudent,
  type LifecycleTx,
  type PlacementArm,
} from './lifecycle.repository';

class FakeLifecycleTx implements LifecycleTx {
  student: LifecycleStudent | undefined;
  term: CurrentTerm | undefined;
  next: { id: string; name: string } | undefined;
  enrolment: EnrolmentFacts | undefined;
  placed = false;
  arm: PlacementArm | undefined;
  arms: PlacementArm[] = [];
  roster: GraduatingStudent[] = [];
  writes: [string, unknown][] = [];
  activities: ActivityInput[] = [];

  lockStudent(): Promise<LifecycleStudent | undefined> {
    return Promise.resolve(this.student);
  }

  currentTerm(): Promise<CurrentTerm | undefined> {
    return Promise.resolve(this.term);
  }

  nextTerm(): Promise<{ id: string; name: string } | undefined> {
    return Promise.resolve(this.next);
  }

  setNotSeen(input: unknown): Promise<void> {
    this.writes.push(['setNotSeen', input]);
    return Promise.resolve();
  }

  clearNotSeen(): Promise<void> {
    this.writes.push(['clearNotSeen', null]);
    return Promise.resolve();
  }

  recordLeaving(write: LeavingWrite): Promise<void> {
    this.writes.push(['recordLeaving', write]);
    return Promise.resolve();
  }

  undoArchive(input: unknown): Promise<void> {
    this.writes.push(['undoArchive', input]);
    return Promise.resolve();
  }

  activeEnrolment(): Promise<EnrolmentFacts | undefined> {
    return Promise.resolve(this.enrolment);
  }

  hasPlacement(): Promise<boolean> {
    return Promise.resolve(this.placed);
  }

  findArm(): Promise<PlacementArm | undefined> {
    return Promise.resolve(this.arm);
  }

  openArmsAtLevel(): Promise<PlacementArm[]> {
    return Promise.resolve(this.arms);
  }

  insertPlacement(input: unknown): Promise<void> {
    this.writes.push(['insertPlacement', input]);
    return Promise.resolve();
  }

  lockRoster(
    _org: string,
    input: { ids: readonly string[] }
  ): Promise<GraduatingStudent[]> {
    return Promise.resolve(
      this.roster.filter((student) => input.ids.includes(student.id))
    );
  }

  graduate(input: { students: readonly GraduatingStudent[] }): Promise<number> {
    this.writes.push(['graduate', input]);
    return Promise.resolve(input.students.length);
  }

  record(input: ActivityInput): Promise<void> {
    this.activities.push(input);
    return Promise.resolve();
  }
}

export class FakeLifecycleRepository extends LifecycleRepository {
  readonly tx = new FakeLifecycleTx();

  transaction<T>(fn: (tx: LifecycleTx) => Promise<T>): Promise<T> {
    return fn(this.tx);
  }
}
