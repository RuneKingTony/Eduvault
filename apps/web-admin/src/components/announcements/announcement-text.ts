import type { Announcement, AnnouncementStatus } from '@eduvault/api-contract';
import { fmtDate, lagosDateOf } from '@eduvault/shared';

export const ANNOUNCEMENT_GONE_MESSAGE =
  'This announcement no longer exists or is outside your campuses.';
const ANNOUNCEMENT_DRAFT_TOAST = 'Saved as a draft. Parents can’t see it yet.';

export const STATUS_TABS: readonly {
  status: AnnouncementStatus;
  label: string;
}[] = [
  { status: 'published', label: 'Published' },
  { status: 'draft', label: 'Drafts' },
  { status: 'withdrawn', label: 'Withdrawn' },
];

export const EMPTY_STATES: Record<
  AnnouncementStatus,
  { title: string; text: string }
> = {
  published: {
    title: 'Nothing published yet',
    text: 'Write an announcement and parents see it on their portal home page.',
  },
  draft: {
    title: 'No drafts',
    text: 'Save an announcement as a draft to finish it later.',
  },
  withdrawn: {
    title: 'Nothing withdrawn',
    text: 'Withdrawn announcements disappear from the portal but are kept here.',
  },
};

export const audienceLabel = (row: Pick<Announcement, 'campusName'>): string =>
  row.campusName === null ? 'Everyone' : `${row.campusName} families`;

export function footerLine(row: Announcement): string {
  const when = {
    published: `Published ${fmtDate(row.publishedOn)}`,
    draft: `Draft saved ${fmtDate(lagosDateOf(row.updatedAt))}`,
    withdrawn: `Withdrawn ${fmtDate(
      row.withdrawnAt === null ? null : lagosDateOf(row.withdrawnAt)
    )}`,
  }[row.status];
  return `${when} by ${row.createdBy.name}`;
}

const publishedToast = (row: Pick<Announcement, 'campusName'>): string =>
  row.campusName === null
    ? 'Published to everyone.'
    : `Published to ${row.campusName} families.`;

export const noticeFor = (
  before: Announcement | null,
  after: Announcement
): string => {
  if (after.status === 'draft') {
    return ANNOUNCEMENT_DRAFT_TOAST;
  }
  return before?.status === 'published'
    ? 'Changes saved. Families see the new version.'
    : publishedToast(after);
};
