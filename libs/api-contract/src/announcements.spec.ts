import {
  announcementFeedQuerySchema,
  announcementListQuerySchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from './announcements';
import { contract } from './contract';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const draft = {
  title: 'PTA meeting',
  body: 'Saturday at ten.',
  tag: 'event',
  campusId: null,
  status: 'draft',
};

const parseTitle = (title: string) =>
  createAnnouncementSchema.safeParse({ ...draft, title }).success;

const parseBody = (body: string) =>
  createAnnouncementSchema.safeParse({ ...draft, body }).success;

const byName = (a: string, b: string) => a.localeCompare(b);

describe('createAnnouncementSchema', () => {
  it('takes an 80 character title and refuses 81', () => {
    expect(parseTitle('a'.repeat(80))).toBe(true);
    expect(parseTitle('a'.repeat(81))).toBe(false);
  });

  it('takes a 2,000 character body and refuses 2,001', () => {
    expect(parseBody('a'.repeat(2000))).toBe(true);
    expect(parseBody('a'.repeat(2001))).toBe(false);
  });

  it('refuses a blank title or body and trims the rest', () => {
    expect(
      createAnnouncementSchema.safeParse({ ...draft, title: '   ' }).success
    ).toBe(false);
    expect(
      createAnnouncementSchema.safeParse({ ...draft, body: '' }).success
    ).toBe(false);
    const parsed = createAnnouncementSchema.parse({
      ...draft,
      title: '  PTA  ',
      body: ' Saturday ',
    });
    expect(parsed.title).toBe('PTA');
    expect(parsed.body).toBe('Saturday');
  });

  it('refuses a bad tag and a withdrawn status', () => {
    expect(
      createAnnouncementSchema.safeParse({ ...draft, tag: 'news' }).success
    ).toBe(false);
    expect(
      createAnnouncementSchema.safeParse({ ...draft, status: 'withdrawn' })
        .success
    ).toBe(false);
  });

  it('defaults pinned to false and takes a campus id or null', () => {
    expect(createAnnouncementSchema.parse(draft).pinned).toBe(false);
    expect(
      createAnnouncementSchema.safeParse({ ...draft, campusId: id }).success
    ).toBe(true);
    expect(
      createAnnouncementSchema.safeParse({ ...draft, campusId: 'lekki' })
        .success
    ).toBe(false);
  });
});

describe('updateAnnouncementSchema', () => {
  it('takes any subset with the same limits', () => {
    expect(updateAnnouncementSchema.parse({})).toEqual({});
    expect(updateAnnouncementSchema.parse({ campusId: null })).toEqual({
      campusId: null,
    });
    expect(
      updateAnnouncementSchema.safeParse({ title: 'a'.repeat(81) }).success
    ).toBe(false);
    expect(
      updateAnnouncementSchema.safeParse({ body: 'a'.repeat(2001) }).success
    ).toBe(false);
    expect(updateAnnouncementSchema.safeParse({ tag: 'x' }).success).toBe(
      false
    );
  });
});

describe('announcementListQuerySchema', () => {
  it('defaults to page 1 of 10 and takes a status', () => {
    expect(announcementListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
    });
    expect(
      announcementListQuerySchema.parse({ status: 'draft', page: '2' })
    ).toEqual({ status: 'draft', page: 2, pageSize: 10 });
    expect(
      announcementListQuerySchema.safeParse({ status: 'gone' }).success
    ).toBe(false);
  });
});

describe('announcementFeedQuerySchema', () => {
  it('defaults the limit to 4 and caps it at 20', () => {
    expect(announcementFeedQuerySchema.parse({})).toEqual({ limit: 4 });
    expect(announcementFeedQuerySchema.parse({ limit: '20' })).toEqual({
      limit: 20,
    });
    expect(announcementFeedQuerySchema.safeParse({ limit: '21' }).success).toBe(
      false
    );
    expect(announcementFeedQuerySchema.safeParse({ limit: '0' }).success).toBe(
      false
    );
  });
});

describe('the announcements routes', () => {
  it('has no delete route', () => {
    const methods = Object.values(contract.announcements).map(
      (route) => route.method
    );
    expect(methods).not.toContain('DELETE');
    expect(Object.keys(contract.announcements).toSorted(byName)).toEqual([
      'create',
      'feed',
      'get',
      'list',
      'pin',
      'publish',
      'update',
      'withdraw',
    ]);
  });
});
