import type { DashboardRoll, MyClass, Scope } from '@eduvault/api-contract';

export interface DashboardScope {
  organizationId: string;
  campusScope: Scope;
  classScope: Scope;
  today: string;
}

export interface Named {
  id: string;
  name: string;
}

export interface Sampled<T> {
  count: number;
  samples: T[];
}

export interface NotInClass extends Sampled<Named> {
  withoutCurrentYearEnrolment: number;
}

export interface RolelessMember {
  memberId: string;
  name: string;
}

export abstract class DashboardRepository {
  abstract hasCurrentTerm(organizationId: string): Promise<boolean>;

  abstract dueLeft(scope: DashboardScope): Promise<Sampled<Named>>;

  abstract notSeen(
    scope: DashboardScope
  ): Promise<Sampled<Named & { notSeenSince: string }>>;

  abstract notInClass(scope: DashboardScope): Promise<NotInClass>;

  abstract noClassTeacher(scope: DashboardScope): Promise<Sampled<Named>>;

  abstract rolelessMembers(
    organizationId: string,
    campusScope: Scope
  ): Promise<RolelessMember[]>;

  abstract roll(scope: DashboardScope): Promise<DashboardRoll>;

  abstract myClasses(scope: DashboardScope, userId: string): Promise<MyClass[]>;
}
