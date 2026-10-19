import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type AnnouncementSummary } from '@eduvault/api-contract';
import { addDays, lagosDateOf } from '@eduvault/shared';
import {
  ADA_ID,
  STRANGER_ID,
  TOBI_ID,
  portalAnnouncementList,
  portalChild,
  portalMe,
  renderWithApi,
  testId,
} from '../test-utils';
import { AnnouncementsPage } from './announcements-page';

const TODAY = lagosDateOf(new Date());
const ada = portalChild({ id: ADA_ID, firstName: 'Ada' });
const tobi = portalChild({ id: TOBI_ID, firstName: 'Tobi' });
const guardian = portalMe({ children: [ada, tobi] });

const item = (
  overrides: Partial<AnnouncementSummary> = {}
): AnnouncementSummary => ({
  id: testId(1),
  title: 'PTA meeting',
  body: 'Saturday at ten.',
  tag: 'event',
  pinned: false,
  publishedOn: addDays(TODAY, -30),
  ...overrides,
});

const manyItems = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) =>
    item({ id: testId(10 + from + index), title: `News ${from + index}` })
  );

const renderPage = (
  announcementList: ReturnType<typeof vi.fn>,
  props: { childId?: string; onBack?: (id: string) => void } = {}
) =>
  renderWithApi(
    <AnnouncementsPage
      me={guardian}
      childId={props.childId}
      onBack={props.onBack ?? vi.fn()}
    />,
    { portal: { announcementList } }
  );

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('AnnouncementsPage', () => {
  it('lists the chosen child’s announcements and asks for the first page of ten', async () => {
    const announcementList = vi.fn().mockResolvedValue(
      portalAnnouncementList({
        items: [item({ title: 'Open day' })],
        total: 1,
      })
    );
    renderPage(announcementList, { childId: TOBI_ID });
    expect(await screen.findByText('Open day')).toBeInTheDocument();
    expect(
      screen.getByText('From the school office for Tobi. Tap one to read more.')
    ).toBeInTheDocument();
    expect(announcementList).toHaveBeenCalledWith({
      params: { studentId: TOBI_ID },
      query: { page: 1, pageSize: 10 },
    });
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  it('falls back to the first child for an unknown id', async () => {
    const announcementList = vi
      .fn()
      .mockResolvedValue(portalAnnouncementList());
    renderPage(announcementList, { childId: STRANGER_ID });
    expect(
      await screen.findByText('No news from the school yet.')
    ).toBeInTheDocument();
    expect(announcementList).toHaveBeenCalledWith(
      expect.objectContaining({ params: { studentId: ADA_ID } })
    );
  });

  it('pages through the list and asks the API for the next page', async () => {
    const announcementList = vi
      .fn()
      .mockImplementation(({ query }: { query: { page: number } }) =>
        Promise.resolve(
          portalAnnouncementList({
            items: manyItems(query.page === 1 ? 10 : 2, (query.page - 1) * 10),
            total: 12,
          })
        )
      );
    renderPage(announcementList, { childId: ADA_ID });
    expect(await screen.findByText('News 0')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 to 10 of 12')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('News 10')).toBeInTheDocument();
    expect(screen.queryByText('News 0')).not.toBeInTheDocument();
    expect(announcementList).toHaveBeenLastCalledWith({
      params: { studentId: ADA_ID },
      query: { page: 2, pageSize: 10 },
    });
  });

  it('goes back to Home carrying the child', async () => {
    const onBack = vi.fn();
    renderPage(vi.fn().mockResolvedValue(portalAnnouncementList()), {
      childId: TOBI_ID,
      onBack,
    });
    await user.click(
      await screen.findByRole('button', { name: 'Back to Home' })
    );
    expect(onBack).toHaveBeenCalledWith(TOBI_ID);
  });

  it('shows the error when the list cannot be loaded', async () => {
    renderPage(
      vi
        .fn()
        .mockRejectedValue(
          new ApiError(404, { code: 'NotFound', message: 'Student not found' })
        ),
      { childId: ADA_ID }
    );
    expect(await screen.findByText('Student not found')).toBeInTheDocument();
  });

  it('says so when no children are linked', () => {
    renderWithApi(
      <AnnouncementsPage
        me={portalMe({ children: [] })}
        childId={undefined}
        onBack={vi.fn()}
      />,
      { portal: {} }
    );
    expect(screen.getByText('No children linked')).toBeInTheDocument();
  });
});
