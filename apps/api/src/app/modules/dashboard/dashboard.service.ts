import { Injectable } from '@nestjs/common';
import type {
  DashboardRoll,
  DashboardTask,
  MyClass,
} from '@eduvault/api-contract';
import { can, type Action, type Resource } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { NewSchoolYearService } from '../student/new-school-year.service';
import { dashboardScope } from './dashboard-scope';
import type { DashboardTaskSource } from './dashboard-task-source';
import {
  DashboardRepository,
  type DashboardScope,
} from './dashboard.repository';

type Builder = (scope: DashboardScope) => Promise<DashboardTask[]>;

type Permission = readonly [Resource, Action];

interface TaskBuilder {
  needs: Permission[];
  needsTerm?: boolean;
  build: Builder;
}

const nonEmpty = (task: DashboardTask): DashboardTask[] =>
  'count' in task && task.count === 0 ? [] : [task];

@Injectable()
export class DashboardService implements DashboardTaskSource {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly newSchoolYear: NewSchoolYearService,
    private readonly clock: Clock
  ) {}

  async tasks(ctx: OrgContext): Promise<DashboardTask[]> {
    const held = this.builders(ctx).filter(({ needs }) =>
      needs.every(([resource, action]) =>
        can(ctx.permissions, resource, action)
      )
    );
    if (held.length === 0) {
      return [];
    }
    const scope = dashboardScope(ctx, this.clock);
    const hasTerm = held.some(({ needsTerm }) => needsTerm === true)
      ? await this.repository.hasCurrentTerm(ctx.organizationId)
      : false;
    const tasks = await Promise.all(
      held
        .filter(({ needsTerm }) => needsTerm !== true || hasTerm)
        .map(({ build }) => build(scope))
    );
    return tasks.flat().flatMap((task) => nonEmpty(task));
  }

  roll(ctx: OrgContext): Promise<DashboardRoll> {
    return this.repository.roll(dashboardScope(ctx, this.clock));
  }

  myClasses(ctx: OrgContext): Promise<MyClass[]> {
    return this.repository.myClasses(
      dashboardScope(ctx, this.clock),
      ctx.user.id
    );
  }

  private builders(ctx: OrgContext): TaskBuilder[] {
    return [
      {
        needs: [
          ['student', 'read'],
          ['student', 'archive'],
        ],
        build: async (scope) => {
          const { count, samples } = await this.repository.dueLeft(scope);
          return [{ kind: 'dueLeft', count, students: samples }];
        },
      },
      {
        needs: [
          ['student', 'read'],
          ['student', 'markAway'],
        ],
        build: async (scope) => {
          const { count, samples } = await this.repository.notSeen(scope);
          return [{ kind: 'notSeen', count, students: samples }];
        },
      },
      {
        needs: [
          ['student', 'read'],
          ['enrollment', 'place'],
        ],
        needsTerm: true,
        build: (scope) => this.notInClass(ctx, scope),
      },
      {
        needs: [['class', 'assignTeacher']],
        needsTerm: true,
        build: async (scope) => {
          const { count, samples } =
            await this.repository.noClassTeacher(scope);
          return [{ kind: 'noClassTeacher', count, classes: samples }];
        },
      },
      {
        needs: [['announcement', 'update']],
        build: async (scope) => {
          const { count, samples } =
            await this.repository.announcementDrafts(scope);
          return [{ kind: 'announcementDrafts', count, titles: samples }];
        },
      },
      {
        needs: [['member', 'update']],
        build: async (scope) => {
          const members = await this.repository.rolelessMembers(
            scope.organizationId,
            scope.campusScope
          );
          return members.map((member) => ({ kind: 'noRole', ...member }));
        },
      },
    ];
  }

  private async notInClass(
    ctx: OrgContext,
    scope: DashboardScope
  ): Promise<DashboardTask[]> {
    const { count, samples, withoutCurrentYearEnrolment } =
      await this.repository.notInClass(scope);
    if (count === 0) {
      return [];
    }
    const offer =
      withoutCurrentYearEnrolment > 0
        ? await this.newSchoolYear.offer(ctx)
        : null;
    return [
      {
        kind: 'notInClass',
        count,
        students: samples,
        startYear: offer === null ? null : { name: offer.name },
      },
    ];
  }
}
