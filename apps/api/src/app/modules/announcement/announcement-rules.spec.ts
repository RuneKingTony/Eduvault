import { ConflictException } from '@nestjs/common';
import type { Announcement } from '@eduvault/api-contract';
import {
  checkAudience,
  planCreate,
  planPin,
  planPublish,
  planUpdate,
  planWithdraw,
} from './announcement-rules';

const TODAY = '2026-10-11';
const NOW = '2026-10-11T09:30:00.000Z';

const made = (overrides: Partial<Announcement> = {}): Announcement => ({
  id: 'a-1',
  title: 'PTA meeting',
  body: 'Saturday at ten.',
  tag: 'event',
  campusId: null,
  campusName: null,
  status: 'draft',
  pinned: false,
  publishedOn: null,
  withdrawnAt: null,
  createdBy: { id: 'u-1', name: 'Tunde Bakare' },
  updatedBy: null,
  updatedAt: NOW,
  ...overrides,
});

const published = made({
  status: 'published',
  pinned: true,
  publishedOn: '2026-10-02',
});
const withdrawn = made({
  status: 'withdrawn',
  publishedOn: '2026-09-21',
  withdrawnAt: '2026-10-01T08:00:00.000Z',
});

describe('planCreate', () => {
  const input = {
    title: 'Sports day',
    body: 'Bring water.',
    tag: 'event',
    campusId: 'lekki',
    pinned: true,
  } as const;

  it('creates a draft unpinned with no publish date', () => {
    const plan = planCreate({ ...input, status: 'draft' }, TODAY);
    expect(plan.event).toBe('created');
    expect(plan.fields).toMatchObject({
      status: 'draft',
      pinned: false,
      publishedOn: null,
    });
  });

  it('creates a published item dated today and keeps the pin', () => {
    const plan = planCreate({ ...input, status: 'published' }, TODAY);
    expect(plan.event).toBe('published');
    expect(plan.fields).toMatchObject({
      status: 'published',
      pinned: true,
      publishedOn: TODAY,
    });
  });
});

describe('planUpdate', () => {
  it('keeps the publish date when a published item is edited', () => {
    const plan = planUpdate(published, { body: 'New time.' }, TODAY);
    expect(plan.event).toBe('updated');
    expect(plan.fields).toMatchObject({
      body: 'New time.',
      status: 'published',
      publishedOn: '2026-10-02',
      pinned: true,
    });
  });

  it('treats status published on a published item as an edit', () => {
    const plan = planUpdate(published, { status: 'published' }, TODAY);
    expect(plan.event).toBe('updated');
    expect(plan.fields.publishedOn).toBe('2026-10-02');
  });

  it('lets an edit of a published item change the pin', () => {
    expect(planUpdate(published, { pinned: false }, TODAY).fields.pinned).toBe(
      false
    );
  });

  it('refuses to turn a published item into a draft', () => {
    expect(() => planUpdate(published, { status: 'draft' }, TODAY)).toThrow(
      ConflictException
    );
  });

  it.each([
    ['draft', made()],
    ['withdrawn', withdrawn],
  ])('publishes a %s item today with the requested pin', (_name, current) => {
    const plan = planUpdate(
      current,
      { status: 'published', pinned: true },
      TODAY
    );
    expect(plan.event).toBe('published');
    expect(plan.fields).toMatchObject({
      status: 'published',
      pinned: true,
      publishedOn: TODAY,
      withdrawnAt: null,
    });
  });

  it('saves a withdrawn item as a draft, unpinned, clearing the withdrawal', () => {
    const plan = planUpdate(withdrawn, { status: 'draft' }, TODAY);
    expect(plan.fields).toMatchObject({
      status: 'draft',
      pinned: false,
      withdrawnAt: null,
    });
  });

  it('ignores a pin on a draft', () => {
    expect(
      planUpdate(made(), { pinned: true, title: 'New' }, TODAY).fields
    ).toMatchObject({ status: 'draft', pinned: false, title: 'New' });
  });

  it('changes the audience, including to everyone', () => {
    expect(
      planUpdate(published, { campusId: null }, TODAY).fields.campusId
    ).toBe(null);
    expect(
      planUpdate(made({ campusId: null }), { campusId: 'lekki' }, TODAY).fields
        .campusId
    ).toBe('lekki');
  });

  it('keeps a withdrawn item withdrawn on a content edit', () => {
    const plan = planUpdate(withdrawn, { title: 'Moved' }, TODAY);
    expect(plan.fields).toMatchObject({
      status: 'withdrawn',
      withdrawnAt: withdrawn.withdrawnAt,
    });
  });
});

describe('planPublish', () => {
  it.each([
    ['draft', made()],
    ['withdrawn', withdrawn],
  ])('publishes a %s item today', (_name, current) => {
    const plan = planPublish(current, TODAY);
    expect(plan.event).toBe('published');
    expect(plan.fields).toMatchObject({
      status: 'published',
      publishedOn: TODAY,
      pinned: false,
      withdrawnAt: null,
    });
  });

  it('refuses a published item', () => {
    expect(() => planPublish(published, TODAY)).toThrow(ConflictException);
  });
});

describe('planWithdraw', () => {
  it('withdraws a published item, unpins it and stamps the withdrawal', () => {
    const plan = planWithdraw(published, NOW);
    expect(plan.event).toBe('withdrawn');
    expect(plan.fields).toMatchObject({
      status: 'withdrawn',
      pinned: false,
      withdrawnAt: NOW,
      publishedOn: '2026-10-02',
    });
  });

  it.each([
    ['draft', made()],
    ['withdrawn', withdrawn],
  ])('refuses a %s item', (_name, current) => {
    expect(() => planWithdraw(current, NOW)).toThrow(ConflictException);
  });
});

describe('planPin', () => {
  it('pins and unpins a published item', () => {
    const unpinned = made({ ...published, pinned: false });
    expect(planPin(unpinned, true)).toMatchObject({
      event: 'pinned',
      fields: { pinned: true },
    });
    expect(planPin(published, false)).toMatchObject({
      event: 'unpinned',
      fields: { pinned: false },
    });
  });

  it.each([
    ['draft', made()],
    ['withdrawn', withdrawn],
  ])('refuses a %s item', (_name, current) => {
    expect(() => planPin(current, true)).toThrow(ConflictException);
    expect(() => planPin(current, false)).toThrow(ConflictException);
  });
});

describe('checkAudience', () => {
  const lekkiOnly = ['lekki'];

  it('lets a school-wide caller target anyone', () => {
    expect(
      checkAudience({ scope: 'all', current: undefined, target: null })
    ).toBe('ok');
    expect(
      checkAudience({ scope: 'all', current: null, target: 'ikeja' })
    ).toBe('ok');
  });

  it('lets a campus-scoped caller target their campus', () => {
    expect(
      checkAudience({ scope: lekkiOnly, current: undefined, target: 'lekki' })
    ).toBe('ok');
    expect(
      checkAudience({ scope: lekkiOnly, current: 'lekki', target: undefined })
    ).toBe('ok');
  });

  it('answers campus-not-found for a campus outside scope', () => {
    expect(
      checkAudience({ scope: lekkiOnly, current: undefined, target: 'ikeja' })
    ).toBe('campus-not-found');
  });

  it('forbids a campus-scoped caller from targeting everyone', () => {
    expect(
      checkAudience({ scope: lekkiOnly, current: undefined, target: null })
    ).toBe('everyone-forbidden');
    expect(
      checkAudience({ scope: lekkiOnly, current: 'lekki', target: null })
    ).toBe('everyone-forbidden');
  });

  it('forbids a campus-scoped caller from changing an everyone item', () => {
    expect(
      checkAudience({ scope: lekkiOnly, current: null, target: undefined })
    ).toBe('everyone-forbidden');
    expect(
      checkAudience({ scope: lekkiOnly, current: null, target: 'lekki' })
    ).toBe('everyone-forbidden');
  });

  it('answers 404 before 403 when the target is out of scope on an everyone item', () => {
    expect(
      checkAudience({ scope: lekkiOnly, current: null, target: 'ikeja' })
    ).toBe('campus-not-found');
  });
});
