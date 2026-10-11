import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ANNOUNCEMENT_EVERYONE_MESSAGE,
  ANNOUNCEMENT_NOT_FOUND_MESSAGE,
  type Announcement,
  type AnnouncementFeedQuery,
  type AnnouncementList,
  type AnnouncementListQuery,
  type AnnouncementSummary,
  type CreateAnnouncementInput,
  type UpdateAnnouncementInput,
} from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import {
  CAMPUS_NOT_FOUND_MESSAGE,
  CampusService,
} from '../campus/campus.service';
import {
  checkAudience,
  planCreate,
  planPin,
  planPublish,
  planUpdate,
  planWithdraw,
  type AnnouncementEvent,
  type AnnouncementFields,
  type Plan,
} from './announcement-rules';
import {
  AnnouncementRepository,
  type AnnouncementScope,
  type AnnouncementWrite,
} from './announcement.repository';

const EVENT_WORDS: Record<AnnouncementEvent, string> = {
  created: 'saved as a draft',
  updated: 'updated',
  published: 'published',
  withdrawn: 'withdrawn',
  pinned: 'pinned',
  unpinned: 'unpinned',
};

const scopeOf = (ctx: OrgContext): AnnouncementScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

function assertAudience(
  ctx: OrgContext,
  current: string | null | undefined,
  target: string | null | undefined
): void {
  const verdict = checkAudience({ scope: ctx.campusScope, current, target });
  if (verdict === 'campus-not-found') {
    throw new NotFoundException(CAMPUS_NOT_FOUND_MESSAGE);
  }
  if (verdict === 'everyone-forbidden') {
    throw new ForbiddenException(ANNOUNCEMENT_EVERYONE_MESSAGE);
  }
}

@Injectable()
export class AnnouncementService {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly campuses: CampusService,
    private readonly clock: Clock
  ) {}

  private async require(ctx: OrgContext, id: string): Promise<Announcement> {
    const found = await this.announcements.findById(scopeOf(ctx), id);
    if (found === undefined) {
      throw new NotFoundException(ANNOUNCEMENT_NOT_FOUND_MESSAGE);
    }
    return found;
  }

  private async assertTarget(
    ctx: OrgContext,
    target: string | null | undefined
  ): Promise<void> {
    if (typeof target === 'string') {
      await this.campuses.assertInScope(ctx, target);
    }
  }

  private writeOf(
    ctx: OrgContext,
    id: string,
    fields: AnnouncementFields
  ): AnnouncementWrite {
    return {
      organizationId: ctx.organizationId,
      id,
      userId: ctx.user.id,
      at: new Date(this.clock.now()),
      fields,
    };
  }

  private activityOf(ctx: OrgContext, id: string, plan: Plan): ActivityInput {
    const { fields, event } = plan;
    return {
      organizationId: ctx.organizationId,
      campusId: fields.campusId,
      pillar: 'foundation',
      kind: `announcement.${event}`,
      actorUserId: ctx.user.id,
      subjectType: 'announcement',
      subjectId: id,
      text: `Announcement “${fields.title}” ${EVENT_WORDS[event]} by ${ctx.user.name}.`,
    };
  }

  private async change(
    ctx: OrgContext,
    id: string,
    options: {
      target?: string | null;
      plan: (current: Announcement) => Plan;
    }
  ): Promise<Announcement> {
    await this.assertTarget(ctx, options.target);
    const changed = await this.announcements.update(
      {
        scope: scopeOf(ctx),
        id,
        userId: ctx.user.id,
        at: new Date(this.clock.now()),
      },
      (current) => {
        assertAudience(ctx, current.campusId, options.target);
        const plan = options.plan(current);
        return {
          fields: plan.fields,
          activity: this.activityOf(ctx, id, plan),
        };
      }
    );
    if (changed === undefined) {
      throw new NotFoundException(ANNOUNCEMENT_NOT_FOUND_MESSAGE);
    }
    return changed;
  }

  list(
    ctx: OrgContext,
    query: AnnouncementListQuery
  ): Promise<AnnouncementList> {
    return this.announcements.list(scopeOf(ctx), query);
  }

  get(ctx: OrgContext, id: string): Promise<Announcement> {
    return this.require(ctx, id);
  }

  async feed(
    ctx: OrgContext,
    query: AnnouncementFeedQuery
  ): Promise<AnnouncementSummary[]> {
    return this.announcements.feed(scopeOf(ctx), query.limit);
  }

  async create(
    ctx: OrgContext,
    input: CreateAnnouncementInput
  ): Promise<Announcement> {
    assertAudience(ctx, undefined, input.campusId);
    await this.assertTarget(ctx, input.campusId);
    const plan = planCreate(input, this.clock.today());
    const id = randomUUID();
    return this.announcements.create(
      this.writeOf(ctx, id, plan.fields),
      this.activityOf(ctx, id, plan)
    );
  }

  update(
    ctx: OrgContext,
    id: string,
    patch: UpdateAnnouncementInput
  ): Promise<Announcement> {
    return this.change(ctx, id, {
      target: patch.campusId,
      plan: (current) => planUpdate(current, patch, this.clock.today()),
    });
  }

  publish(ctx: OrgContext, id: string): Promise<Announcement> {
    return this.change(ctx, id, {
      plan: (current) => planPublish(current, this.clock.today()),
    });
  }

  withdraw(ctx: OrgContext, id: string): Promise<Announcement> {
    return this.change(ctx, id, {
      plan: (current) => planWithdraw(current, this.clock.now()),
    });
  }

  pin(ctx: OrgContext, id: string, pinned: boolean): Promise<Announcement> {
    return this.change(ctx, id, {
      plan: (current) => planPin(current, pinned),
    });
  }
}
