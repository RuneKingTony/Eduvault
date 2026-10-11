import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import {
  IKEJA,
  LEKKI,
  announcement,
  announcementList,
  campus,
} from '../test-announcements';
import { fakeAccess, ownerAccess, renderWithApi } from '../test-utils';
import { AnnouncementsPage } from './announcements-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const WRITER: Permission[] = [
  'announcement:create',
  'announcement:read',
  'announcement:update',
];

const writerAccess = (reach: 'all' | string[]) =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(
      reach === 'all' ? [...WRITER, 'campus:readAll'] : WRITER
    ),
    campusScope: reach,
  });

const draft = announcement({
  id: 'd1',
  title: 'Sports day',
  status: 'draft',
  publishedOn: null,
});
const live = announcement({
  id: 'p1',
  title: 'PTA meeting',
  pinned: true,
  campusId: LEKKI,
  campusName: 'Lekki',
});
const withdrawn = announcement({
  id: 'w1',
  title: 'Old news',
  status: 'withdrawn',
  withdrawnAt: '2026-10-03T08:00:00.000Z',
});

function setup(
  options: {
    access?: ReturnType<typeof fakeAccess>;
    campuses?: ReturnType<typeof campus>[];
    list?: ReturnType<typeof announcementList>;
  } = {}
) {
  const counts = { published: 1, draft: 1, withdrawn: 1 };
  const byStatus = {
    published: announcementList([live], { counts }),
    draft: announcementList([draft], { counts }),
    withdrawn: announcementList([withdrawn], { counts }),
  };
  const api = {
    announcements: {
      list: vi.fn(({ query }: { query: { status: keyof typeof byStatus } }) =>
        Promise.resolve(options.list ?? byStatus[query.status])
      ),
      create: vi.fn().mockResolvedValue(live),
      update: vi.fn().mockResolvedValue(live),
      publish: vi.fn().mockResolvedValue({
        ...draft,
        status: 'published',
        publishedOn: '2026-10-11',
      }),
      withdraw: vi.fn().mockResolvedValue(withdrawn),
      pin: vi.fn().mockResolvedValue(live),
    },
    campuses: {
      list: vi
        .fn()
        .mockResolvedValue(
          options.campuses ?? [campus(LEKKI, 'Lekki'), campus(IKEJA, 'Ikeja')]
        ),
    },
  };
  renderWithApi(<AnnouncementsPage />, api, options.access ?? ownerAccess());
  return api;
}

const openNew = async () => {
  fireEvent.click(
    await screen.findByRole('button', { name: 'New announcement' })
  );
  return screen.findByRole('dialog');
};

describe('AnnouncementsPage list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens on Published and shows a count on each tab', async () => {
    const api = setup();
    expect(await screen.findByText('PTA meeting')).toBeInTheDocument();
    expect(api.announcements.list).toHaveBeenCalledWith({
      query: { status: 'published', page: 1 },
    });
    expect(screen.getByRole('tab', { name: 'Published 1' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Drafts 1' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Withdrawn 1' })
    ).toBeInTheDocument();
  });

  it('shows the badges and the footer line for each status', async () => {
    setup();
    expect(await screen.findByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('Lekki families')).toBeInTheDocument();
    expect(screen.getByText('Event')).toBeInTheDocument();
    expect(
      screen.getByText('Published 9 Oct 2026 by Tunde Bakare')
    ).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Drafts 1' }));
    expect(
      await screen.findByText('Draft saved 9 Oct 2026 by Tunde Bakare')
    ).toBeInTheDocument();
    expect(screen.getByText('Everyone')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Withdrawn 1' }));
    expect(
      await screen.findByText('Withdrawn 3 Oct 2026 by Tunde Bakare')
    ).toBeInTheDocument();
  });

  it('offers row actions that fit each status', async () => {
    setup();
    await screen.findByText('PTA meeting');
    for (const name of ['Edit', 'Unpin', 'Withdraw']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Drafts 1' }));
    await screen.findByText('Sports day');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Withdrawn 1' }));
    await screen.findByText('Old news');
    expect(
      screen.getByRole('button', { name: 'Publish again' })
    ).toBeInTheDocument();
  });

  it('shows the pager at 23 items and none at 10 or fewer', async () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      announcement({ id: `p${index}`, title: `Item ${index}` })
    );
    const api = setup({
      list: announcementList(items, {
        total: 23,
        counts: { published: 23, draft: 0, withdrawn: 0 },
      }),
    });
    expect(
      await screen.findByText('Showing 1 to 10 of 23')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => {
      expect(api.announcements.list).toHaveBeenCalledWith({
        query: { status: 'published', page: 2 },
      });
    });
  });

  it('hides the pager at ten items', async () => {
    setup({
      list: announcementList(
        Array.from({ length: 10 }, (_, index) =>
          announcement({ id: `p${index}`, title: `Item ${index}` })
        )
      ),
    });
    await screen.findByText('Item 0');
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  it.each([
    ['Published', 'Nothing published yet'],
    ['Drafts', 'No drafts'],
    ['Withdrawn', 'Nothing withdrawn'],
  ])('shows the %s empty state', async (tab, title) => {
    setup({
      list: announcementList([], {
        counts: { published: 0, draft: 0, withdrawn: 0 },
      }),
    });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: `${tab} 0` }));
    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  it('shows the error inside the card', async () => {
    const api = setup();
    api.announcements.list.mockRejectedValue(
      new ApiError(500, { code: 'InternalError', message: 'List is down' })
    );
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Drafts 1' }));
    expect(await screen.findByText('List is down')).toBeInTheDocument();
  });
});

describe('AnnouncementsPage permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides New announcement and every row action without the write permissions', async () => {
    setup({
      access: fakeAccess({
        roles: ['custom'],
        permissions: { announcement: ['read'] },
        campusScope: 'all',
      }),
    });
    await screen.findByText('PTA meeting');
    expect(
      screen.queryByRole('button', { name: 'New announcement' })
    ).toBeNull();
    for (const name of ['Edit', 'Unpin', 'Withdraw']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('hides the actions on an Everyone item from a writer who does not see every campus', async () => {
    setup({
      access: writerAccess([LEKKI]),
      list: announcementList([
        announcement({ id: 'e1', title: 'For everyone' }),
        announcement({
          id: 'l1',
          title: 'Just Lekki',
          campusId: LEKKI,
          campusName: 'Lekki',
        }),
      ]),
    });
    await screen.findByText('For everyone');
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
  });

  it('keeps the owner’s actions on an Everyone item', async () => {
    setup({ list: announcementList([announcement()]) });
    expect(
      await screen.findByRole('button', { name: 'Edit' })
    ).toBeInTheDocument();
  });
});

describe('AnnouncementsPage editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers Save as draft and Publish on a new announcement', async () => {
    setup();
    const sheet = await openNew();
    expect(sheet).toHaveTextContent('New announcement');
    expect(
      await screen.findByRole('button', { name: 'Save as draft' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByText('0 / 2,000')).toBeInTheDocument();
  });

  it('counts the message and stops the title at 80', async () => {
    setup();
    await openNew();
    const message = await screen.findByLabelText('Message');
    fireEvent.change(message, { target: { value: 'Bring water' } });
    expect(screen.getByText('11 / 2,000')).toBeInTheDocument();
    expect(message).toHaveAttribute('maxlength', '2000');
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '80');
  });

  it('hides Save as draft when editing a published item', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(
      await screen.findByRole('button', { name: 'Save changes' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save as draft' })).toBeNull();
    expect(screen.getByLabelText('Title')).toHaveValue('PTA meeting');
  });

  it('keeps Save as draft when editing a draft', async () => {
    setup();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Drafts 1' }));
    await screen.findByText('Sports day');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(
      await screen.findByRole('button', { name: 'Save as draft' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('defaults the audience to the one campus in scope and hides Everyone', async () => {
    setup({
      access: writerAccess([LEKKI]),
      campuses: [campus(LEKKI, 'Lekki')],
    });
    await openNew();
    const audience = await screen.findByLabelText('Who sees it');
    expect(audience).toHaveValue(LEKKI);
    expect(
      screen.queryByRole('option', { name: 'Everyone' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Lekki families only' })
    ).toBeInTheDocument();
  });

  it('offers Everyone first to someone who sees every campus', async () => {
    setup({ access: writerAccess('all') });
    await openNew();
    const audience = await screen.findByLabelText('Who sees it');
    expect(audience).toHaveValue('everyone');
    expect(
      screen.getByRole('option', { name: 'Everyone' })
    ).toBeInTheDocument();
  });

  it('refuses an empty form with the toast and sends nothing', async () => {
    const api = setup();
    await openNew();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Add a title and a message.');
    });
    expect(api.announcements.create).not.toHaveBeenCalled();
  });

  it('saves a draft with its pin ignored and switches to the Drafts tab', async () => {
    const api = setup();
    api.announcements.create.mockResolvedValue(draft);
    await openNew();
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Sports day' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Bring water.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pin to the top' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    await waitFor(() => {
      expect(api.announcements.create).toHaveBeenCalledWith({
        body: {
          title: 'Sports day',
          body: 'Bring water.',
          tag: 'general',
          campusId: null,
          pinned: false,
          status: 'draft',
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Saved as a draft. Parents can’t see it yet.'
      );
    });
    await waitFor(() => {
      expect(api.announcements.list).toHaveBeenCalledWith({
        query: { status: 'draft', page: 1 },
      });
    });
  });

  it('publishes to one campus and confirms with a toast', async () => {
    const api = setup({
      access: writerAccess([LEKKI]),
      campuses: [campus(LEKKI, 'Lekki')],
    });
    api.announcements.create.mockResolvedValue(live);
    await openNew();
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'PTA meeting' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Saturday.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Published to Lekki families.'
      );
    });
    expect(api.announcements.create).toHaveBeenCalledWith({
      body: expect.objectContaining({ campusId: LEKKI, status: 'published' }),
    });
  });

  it('closes with the not-found message when the item is gone', async () => {
    const api = setup();
    api.announcements.update.mockRejectedValue(
      new ApiError(404, { code: 'NotFound', message: 'Announcement not found' })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' })
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'This announcement no longer exists or is outside your campuses.'
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

describe('AnnouncementsPage row actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes a draft from its row and opens the Published tab', async () => {
    const api = setup();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Drafts 1' }));
    await screen.findByText('Sports day');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => {
      expect(api.announcements.publish).toHaveBeenCalledWith({
        params: { id: 'd1' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Published. Families see it on the portal now.'
      );
    });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Published/ })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });
  });

  it('withdraws a published item and opens the Withdrawn tab', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    await waitFor(() => {
      expect(api.announcements.withdraw).toHaveBeenCalledWith({
        params: { id: 'p1' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Withdrawn. It no longer shows on the portal.'
      );
    });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Withdrawn/ })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });
  });

  it('unpins a pinned item', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Unpin' }));
    await waitFor(() => {
      expect(api.announcements.pin).toHaveBeenCalledWith({
        params: { id: 'p1' },
        body: { pinned: false },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Unpinned.');
    });
  });
});
