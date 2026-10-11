import type {
  Announcement,
  AnnouncementList,
  Campus,
} from '@eduvault/api-contract';

export const LEKKI = '00000000-0000-4000-8000-0000000000a1';
export const IKEJA = '00000000-0000-4000-8000-0000000000a2';

export const campus = (id: string, name: string): Campus => ({
  id,
  organizationId: '00000000-0000-4000-8000-0000000000aa',
  name,
  address: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

export const announcement = (
  overrides: Partial<Announcement> = {}
): Announcement => ({
  id: '00000000-0000-4000-8000-0000000000b1',
  title: 'PTA meeting',
  body: 'Saturday at ten.',
  tag: 'event',
  campusId: null,
  campusName: null,
  status: 'published',
  pinned: false,
  publishedOn: '2026-10-09',
  withdrawnAt: null,
  createdBy: { id: 'u1', name: 'Tunde Bakare' },
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
