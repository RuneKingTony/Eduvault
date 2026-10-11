import type { DashboardRoll, MyClass } from '@eduvault/api-contract';
import {
  DashboardRepository,
  type DashboardScope,
  type Named,
  type NotInClass,
  type RolelessMember,
  type Sampled,
} from './dashboard.repository';

const none = { count: 0, samples: [] };

export class FakeDashboardRepository extends DashboardRepository {
  currentTerm = true;
  due: Sampled<Named> = none;
  away: Sampled<Named & { notSeenSince: string }> = none;
  unplaced: NotInClass = { ...none, withoutCurrentYearEnrolment: 0 };
  unled: Sampled<Named> = none;
  roleless: RolelessMember[] = [];
  rollCounts: DashboardRoll = {
    active: 0,
    newIntakes: 0,
    inactive: 0,
    dueLeft: 0,
    left: 0,
    leftThisTerm: 0,
    graduated: 0,
    campusNames: null,
  };
  classes: MyClass[] = [];
  calls: string[] = [];
  scopes: DashboardScope[] = [];

  private seen(name: string, scope?: DashboardScope): void {
    this.calls.push(name);
    if (scope !== undefined) {
      this.scopes.push(scope);
    }
  }

  hasCurrentTerm(): Promise<boolean> {
    return Promise.resolve(this.currentTerm);
  }

  dueLeft(scope: DashboardScope): Promise<Sampled<Named>> {
    this.seen('dueLeft', scope);
    return Promise.resolve(this.due);
  }

  notSeen(
    scope: DashboardScope
  ): Promise<Sampled<Named & { notSeenSince: string }>> {
    this.seen('notSeen', scope);
    return Promise.resolve(this.away);
  }

  notInClass(scope: DashboardScope): Promise<NotInClass> {
    this.seen('notInClass', scope);
    return Promise.resolve(this.unplaced);
  }

  noClassTeacher(scope: DashboardScope): Promise<Sampled<Named>> {
    this.seen('noClassTeacher', scope);
    return Promise.resolve(this.unled);
  }

  rolelessMembers(): Promise<RolelessMember[]> {
    this.seen('rolelessMembers');
    return Promise.resolve(this.roleless);
  }

  roll(scope: DashboardScope): Promise<DashboardRoll> {
    this.seen('roll', scope);
    return Promise.resolve(this.rollCounts);
  }

  myClasses(scope: DashboardScope): Promise<MyClass[]> {
    this.seen('myClasses', scope);
    return Promise.resolve(this.classes);
  }
}
