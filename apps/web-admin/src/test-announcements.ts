import type {
  Announcement,
  AnnouncementList,
  Campus,
} from '@eduvault/api-contract';
import { testId } from './test-api';

export const LEKKI = testId(0x1_30_01);
export const IKEJA = testId(0x1_30_02);
export const SCHOOL_ID = testId(0x1_30_03);
export const ANNOUNCEMENT_ID = testId(0x1_30_11);
export const AUTHOR_ID = testId(0x1_30_21);

export const campus = (id: string, name: string): Campus => ({
  id,
  organizationId: SCHOOL_ID,
  name,
  address: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

export const announcement = (
  overrides: Partial<Announcement> = {}
): Announcement => ({
  id: ANNOUNCEMENT_ID,
  title: 'PTA meeting',
  body: 'Saturday at ten.',
  tag: 'event',
  campusId: null,
  campusName: null,
  status: 'published',
  pinned: false,
  publishedOn: '2026-10-09',
  withdrawnAt: null,
  createdBy: { id: AUTHOR_ID, name: 'Tunde Bakare' },
  updatedBy: null,
  updatedAt: '2026-10-09T09:00:00.000Z',
  ...overrides,
});

export const announcementList = (
  items: Announcement[],
  overrides: Partial<AnnouncementList> = {}
): AnnouncementList => ({
  items,
  total: items.length,
  counts: { published: items.length, draft: 0, withdrawn: 0 },
  ...overrides,
});
