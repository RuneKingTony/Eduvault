import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ANNOUNCEMENT_EVERYONE_MESSAGE,
  ANNOUNCEMENT_NOT_FOUND_MESSAGE,
  type Announcement,
} from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { CampusService } from '../campus/campus.service';
import { AnnouncementService } from './announcement.service';
import { FakeAnnouncementRepository } from './fake-announcement.repository';

const TODAY = '2026-10-11';
const byId = (a: string, b: string) => a.localeCompare(b);
const NOW = '2026-10-01T09:00:00.000Z';

const ctxFor = (
  campusScope: OrgContext['campusScope'],
  roles: string[] = ['administrator']
) =>
  ({
    organizationId: 'school-a',
    user: { id: 'caller', email: 'c@eduvault.test', name: 'Tunde Bakare' },
    roles,
    permissions: toPermissionMap([]),
    campusScope,
    classScope: 'all',
  }) as OrgContext;

const everyone = ctxFor('all');
const lekkiOnly = ctxFor(['lekki']);

const row = (overrides: Partial<Announcement> = {}): Announcement => ({
  id: 'a-1',
  title: 'PTA meeting',
  body: 'Saturday at ten.',
  tag: 'event',
  campusId: 'lekki',
  campusName: 'Lekki',
  status: 'draft',
  pinned: false,
  publishedOn: null,
  withdrawnAt: null,
  createdBy: { id: 'u-1', name: 'Ada' },
  updatedBy: null,
  updatedAt: NOW,
  ...overrides,
});

function setup(...seeded: Announcement[]) {
  const repository = new FakeAnnouncementRepository();
  for (const item of seeded) {
    repository.seed('school-a', item);
  }
  const campuses = {
    assertInScope: vi.fn().mockResolvedValue(undefined),
  };
  const clock = new Clock();
  clock.set(TODAY);
  return {
    repository,
    campuses,
    service: new AnnouncementService(
      repository,
      campuses as unknown as CampusService,
      clock
    ),
  };
}

const published = row({
  status: 'published',
  publishedOn: '2026-10-02',
  pinned: true,
});

describe('activity', () => {
  it('writes an activity event for each of the six actions', async () => {
    const { repository, service } = setup(
      row({ id: 'draft-1' }),
      { ...published, id: 'pub-1' },
      { ...published, id: 'pub-2', pinned: false }
    );
    await service.create(everyone, {
      title: 'Open day',
      body: 'Come.',
      tag: 'general',
      campusId: 'lekki',
      status: 'draft',
    });
    await service.update(everyone, 'pub-1', { body: 'New time.' });
    await service.publish(everyone, 'draft-1');
    await service.withdraw(everyone, 'pub-1');
    await service.pin(everyone, 'pub-2', true);
    await service.pin(everyone, 'pub-2', false);
    expect(repository.activities.map((event) => event.kind)).toEqual([
      'announcement.created',
      'announcement.updated',
      'announcement.published',
      'announcement.withdrawn',
      'announcement.pinned',
      'announcement.unpinned',
    ]);
  });

  it('records a foundation event on the audience campus with a sentence', async () => {
    const { repository, service } = setup(row());
    await service.publish(everyone, 'a-1');
    expect(repository.activities).toEqual([
      expect.objectContaining({
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'foundation',
        actorUserId: 'caller',
        subjectType: 'announcement',
        subjectId: 'a-1',
        text: 'Announcement “PTA meeting” published by Tunde Bakare.',
      }),
    ]);
  });

  it('records an everyone item with no campus', async () => {
    const { repository, service } = setup();
    await service.create(everyone, {
      title: 'Welcome back',
      body: 'Term starts Monday.',
      tag: 'general',
      campusId: null,
      status: 'published',
    });
    expect(repository.activities[0]).toMatchObject({
      campusId: null,
      kind: 'announcement.published',
    });
  });
});

describe('clock', () => {
  it('stamps a create with the clock’s instant', async () => {
    const { repository, service } = setup();
    await service.create(everyone, {
      title: 'Open day',
      body: 'Come.',
      tag: 'general',
      campusId: null,
      status: 'draft',
    });
    expect(repository.writes[0]?.at.toISOString()).toBe(
      `${TODAY}T12:00:00.000Z`
    );
  });
});

describe('scope', () => {
  it('answers 404 for a missing id and one on a campus out of scope', async () => {
    const { service } = setup(row({ id: 'ikeja-1', campusId: 'ikeja' }));
    await expect(service.get(lekkiOnly, 'ikeja-1')).rejects.toThrow(
      new NotFoundException(ANNOUNCEMENT_NOT_FOUND_MESSAGE)
    );
    await expect(service.get(lekkiOnly, 'nope')).rejects.toThrow(
      NotFoundException
    );
    await expect(service.publish(lekkiOnly, 'ikeja-1')).rejects.toThrow(
      NotFoundException
    );
    await expect(
      service.pin(lekkiOnly, 'ikeja-1', true)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 for another school’s item', async () => {
    const repository = new FakeAnnouncementRepository();
    repository.seed('school-b', row({ id: 'b-1' }));
    const service = new AnnouncementService(
      repository,
      { assertInScope: vi.fn() } as unknown as CampusService,
      new Clock()
    );
    await expect(service.get(everyone, 'b-1')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('answers 404 when creating for a campus outside scope', async () => {
    const { campuses, service } = setup();
    campuses.assertInScope.mockRejectedValue(
      new NotFoundException('Campus not found')
    );
    await expect(
      service.create(everyone, {
        title: 'x',
        body: 'y',
        tag: 'fees',
        campusId: 'b-campus',
        status: 'draft',
      })
    ).rejects.toThrow(new NotFoundException('Campus not found'));
  });

  it('lists only everyone and in-scope campus items', async () => {
    const { service } = setup(
      row({ id: 'l', campusId: 'lekki' }),
      row({ id: 'i', campusId: 'ikeja' }),
      row({ id: 'e', campusId: null })
    );
    const list = await service.list(lekkiOnly, { page: 1, pageSize: 10 });
    expect(list.items.map((item) => item.id).toSorted(byId)).toEqual([
      'e',
      'l',
    ]);
    expect(list.counts.draft).toBe(2);
  });
});

describe('everyone items', () => {
  const noEveryone = new ForbiddenException(ANNOUNCEMENT_EVERYONE_MESSAGE);

  it('refuses a campus-scoped writer creating for everyone', async () => {
    const { repository, service } = setup();
    await expect(
      service.create(lekkiOnly, {
        title: 'x',
        body: 'y',
        tag: 'general',
        campusId: null,
        status: 'draft',
      })
    ).rejects.toThrow(noEveryone);
    expect(repository.writes).toEqual([]);
  });

  it('refuses a campus-scoped writer editing, publishing, withdrawing or pinning one', async () => {
    const item = row({
      campusId: null,
      status: 'published',
      publishedOn: TODAY,
    });
    const { service } = setup(item);
    await expect(
      service.update(lekkiOnly, 'a-1', { title: 'New' })
    ).rejects.toThrow(noEveryone);
    await expect(service.publish(lekkiOnly, 'a-1')).rejects.toThrow(noEveryone);
    await expect(service.withdraw(lekkiOnly, 'a-1')).rejects.toThrow(
      noEveryone
    );
    await expect(service.pin(lekkiOnly, 'a-1', true)).rejects.toThrow(
      noEveryone
    );
  });

  it('refuses moving a campus item to everyone', async () => {
    const { service } = setup(row());
    await expect(
      service.update(lekkiOnly, 'a-1', { campusId: null })
    ).rejects.toThrow(noEveryone);
  });

  it('lets a school-wide writer change an everyone item', async () => {
    const { service } = setup(row({ campusId: null }));
    const updated = await service.update(everyone, 'a-1', { title: 'New' });
    expect(updated.title).toBe('New');
  });
});

describe('transitions', () => {
  it('answers 409 for each refused transition', async () => {
    const { service } = setup(
      row({ id: 'draft' }),
      { ...published, id: 'pub' },
      row({ id: 'out', status: 'withdrawn', publishedOn: '2026-09-21' })
    );
    await expect(service.publish(everyone, 'pub')).rejects.toBeInstanceOf(
      ConflictException
    );
    await expect(service.withdraw(everyone, 'draft')).rejects.toBeInstanceOf(
      ConflictException
    );
    await expect(service.withdraw(everyone, 'out')).rejects.toBeInstanceOf(
      ConflictException
    );
    await expect(service.pin(everyone, 'draft', true)).rejects.toBeInstanceOf(
      ConflictException
    );
    await expect(service.pin(everyone, 'out', false)).rejects.toBeInstanceOf(
      ConflictException
    );
    await expect(
      service.update(everyone, 'pub', { status: 'draft' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('writes nothing and no activity when a transition is refused', async () => {
    const { repository, service } = setup(row());
    await expect(service.withdraw(everyone, 'a-1')).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(repository.writes).toEqual([]);
    expect(repository.activities).toEqual([]);
  });

  it('dates a publish today, and a re-publish of a withdrawn item today', async () => {
    const { service } = setup(
      row(),
      row({ id: 'out', status: 'withdrawn', publishedOn: '2026-09-21' })
    );
    expect((await service.publish(everyone, 'a-1')).publishedOn).toBe(TODAY);
    expect((await service.publish(everyone, 'out')).publishedOn).toBe(TODAY);
  });

  it('keeps the publish date when a published item is edited', async () => {
    const { service } = setup({ ...published });
    const edited = await service.update(everyone, 'a-1', { body: 'Moved.' });
    expect(edited.publishedOn).toBe('2026-10-02');
    expect(edited.body).toBe('Moved.');
  });

  it('unpins on withdraw', async () => {
    const { service } = setup({ ...published });
    const withdrawn = await service.withdraw(everyone, 'a-1');
    expect(withdrawn).toMatchObject({ status: 'withdrawn', pinned: false });
    expect(withdrawn.withdrawnAt).toBe(`${TODAY}T12:00:00.000Z`);
  });
});

describe('feed', () => {
  it('returns published in-scope items to a staff member', async () => {
    const { service } = setup(
      { ...published, id: 'l', campusId: 'lekki' },
      { ...published, id: 'i', campusId: 'ikeja' },
      row({ id: 'd' })
    );
    const feed = await service.feed(ctxFor(['lekki'], ['teacher']), {
      limit: 4,
    });
    expect(feed.map((item) => item.id)).toEqual(['l']);
  });
});
