import { ConflictException } from '@nestjs/common';
import {
  announcementTransitionMessage,
  type Announcement,
  type AnnouncementStatus,
  type CreateAnnouncementInput,
  type UpdateAnnouncementInput,
} from '@eduvault/api-contract';
import { canSeeCampus, type CampusScope } from '../../common/campus-scope';

export interface AnnouncementFields {
  title: string;
  body: string;
  tag: Announcement['tag'];
  campusId: string | null;
  status: AnnouncementStatus;
  pinned: boolean;
  publishedOn: string | null;
  withdrawnAt: string | null;
}

export type AnnouncementEvent =
  'created' | 'updated' | 'published' | 'withdrawn' | 'pinned' | 'unpinned';

export interface Plan {
  fields: AnnouncementFields;
  event: AnnouncementEvent;
}

type AudienceVerdict = 'ok' | 'campus-not-found' | 'everyone-forbidden';

const fieldsOf = (current: Announcement): AnnouncementFields => ({
  title: current.title,
  body: current.body,
  tag: current.tag,
  campusId: current.campusId,
  status: current.status,
  pinned: current.pinned,
  publishedOn: current.publishedOn,
  withdrawnAt: current.withdrawnAt,
});

export function planCreate(
  input: CreateAnnouncementInput,
  today: string
): Plan {
  const published = input.status === 'published';
  return {
    event: published ? 'published' : 'created',
    fields: {
      title: input.title,
      body: input.body,
      tag: input.tag,
      campusId: input.campusId,
      status: input.status,
      pinned: published && input.pinned === true,
      publishedOn: published ? today : null,
      withdrawnAt: null,
    },
  };
}

const contentOf = (
  base: AnnouncementFields,
  patch: UpdateAnnouncementInput
) => ({
  title: patch.title ?? base.title,
  body: patch.body ?? base.body,
  tag: patch.tag ?? base.tag,
  campusId: patch.campusId === undefined ? base.campusId : patch.campusId,
});

export function planUpdate(
  current: Announcement,
  patch: UpdateAnnouncementInput,
  today: string
): Plan {
  if (patch.status === 'draft' && current.status === 'published') {
    throw new ConflictException(announcementTransitionMessage('draft'));
  }
  const base = fieldsOf(current);
  const content = contentOf(base, patch);
  if (current.status === 'published') {
    return {
      event: 'updated',
      fields: { ...base, ...content, pinned: patch.pinned ?? base.pinned },
    };
  }
  if (patch.status === 'published') {
    return {
      event: 'published',
      fields: {
        ...base,
        ...content,
        status: 'published',
        pinned: patch.pinned === true,
        publishedOn: today,
        withdrawnAt: null,
      },
    };
  }
  const draft = patch.status === 'draft';
  return {
    event: 'updated',
    fields: {
      ...base,
      ...content,
      status: draft ? 'draft' : base.status,
      pinned: false,
      withdrawnAt: draft ? null : base.withdrawnAt,
    },
  };
}

export function planPublish(current: Announcement, today: string): Plan {
  if (current.status === 'published') {
    throw new ConflictException(announcementTransitionMessage('publish'));
  }
  return {
    event: 'published',
    fields: {
      ...fieldsOf(current),
      status: 'published',
      pinned: false,
      publishedOn: today,
      withdrawnAt: null,
    },
  };
}

export function planWithdraw(current: Announcement, now: string): Plan {
  if (current.status !== 'published') {
    throw new ConflictException(announcementTransitionMessage('withdraw'));
  }
  return {
    event: 'withdrawn',
    fields: {
      ...fieldsOf(current),
      status: 'withdrawn',
      pinned: false,
      withdrawnAt: now,
    },
  };
}

export function planPin(current: Announcement, pinned: boolean): Plan {
  if (current.status !== 'published') {
    throw new ConflictException(announcementTransitionMessage('pin'));
  }
  return {
    event: pinned ? 'pinned' : 'unpinned',
    fields: { ...fieldsOf(current), pinned },
  };
}

// `undefined` leaves that side out of the check; `null` is "everyone".
export function checkAudience(input: {
  scope: CampusScope;
  current: string | null | undefined;
  target: string | null | undefined;
}): AudienceVerdict {
  const { scope, current, target } = input;
  if (typeof target === 'string' && !canSeeCampus(scope, target)) {
    return 'campus-not-found';
  }
  const touchesEveryone = target === null || current === null;
  return touchesEveryone && scope !== 'all' ? 'everyone-forbidden' : 'ok';
}
