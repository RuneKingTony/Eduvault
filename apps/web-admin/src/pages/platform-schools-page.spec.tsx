import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { platformSchool, renderWithApi, schoolList } from '../test-utils';
import { PlatformSchoolsPage } from './platform-schools-page';

const setup = (answers: ReturnType<typeof schoolList>[]) => {
  const handlers = { onOpenSchool: vi.fn(), onOpenAudit: vi.fn() };
  const list = vi.fn();
  for (const answer of answers) {
    list.mockResolvedValueOnce(answer);
  }
  list.mockResolvedValue(answers.at(-1));
  renderWithApi(<PlatformSchoolsPage {...handlers} />, {
    platform: { schools: { list } },
  });
  return { list, ...handlers };
};

const manySchools = () =>
  schoolList(
    Array.from({ length: 10 }, (_, index) =>
      platformSchool({ id: `s${index}`, name: `School ${index}` })
    ),
    {
      totals: { schools: 11, active: 11, students: 280, actingRequests: 0 },
      nextCursor: 'next-page',
    }
  );

describe('PlatformSchoolsPage', () => {
  it('shows the head, the three stat cards and a row per school', async () => {
    setup([
      schoolList(
        [
          platformSchool(),
          platformSchool({
            id: 's2',
            name: 'Hilltop Academy',
            slug: 'hilltop',
            city: null,
            owners: [],
            students: 0,
            status: 'suspended',
            createdAt: '2026-08-20T10:00:00.000Z',
          }),
        ],
        {
          totals: { schools: 2, active: 1, students: 28, actingRequests: 3 },
        }
      ),
    ]);

    expect(
      await screen.findByRole('heading', { name: 'Schools' })
    ).toBeInTheDocument();
    expect(
      await screen.findByText('2 schools on Eduvault')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Only a super admin creates schools.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create school' })
    ).toBeInTheDocument();

    expect(screen.getByText('1 active')).toBeInTheDocument();
    expect(screen.getByText('Across every school')).toBeInTheDocument();
    expect(screen.getByText('All audited')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /Acting requests/ })).getByText(
        '3'
      )
    ).toBeInTheDocument();

    for (const heading of [
      'School',
      'Owner',
      'City',
      'Students',
      'Status',
      'Created',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: heading })
      ).toBeInTheDocument();
    }
    expect(screen.getByText('greenfield')).toHaveClass('font-mono');
    expect(screen.getByText('Funmi Adeyemi')).toBeInTheDocument();
    expect(screen.getByText('funmi@greenfield.test')).toBeInTheDocument();
    expect(screen.getByText('Lagos')).toBeInTheDocument();
    expect(screen.getByText('28', { selector: 'td' })).toHaveClass(
      'text-right'
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('12 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('20 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Hilltop Academy')).toBeInTheDocument();
  });

  it('opens a school from its row and the audit log from its card', async () => {
    const { onOpenSchool, onOpenAudit } = setup([
      schoolList([platformSchool()]),
    ]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Greenfield College' })
    );
    expect(onOpenSchool).toHaveBeenCalledExactlyOnceWith('s1');
    fireEvent.click(screen.getByRole('button', { name: /Acting requests/ }));
    expect(onOpenAudit).toHaveBeenCalledOnce();
  });

  it('says there is nothing yet when no school exists', async () => {
    setup([schoolList([])]);
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('0 schools on Eduvault')).toBeInTheDocument();
  });

  it('has no search box until there are more than ten schools', async () => {
    setup([schoolList([platformSchool()])]);
    await screen.findByText('Greenfield College');
    expect(
      screen.queryByRole('searchbox', { name: /Search schools/ })
    ).not.toBeInTheDocument();
  });

  it('searches by name or slug once there are more than ten', async () => {
    const { list } = setup([manySchools()]);
    const box = await screen.findByRole('searchbox', {
      name: 'Search schools by name or slug',
    });
    fireEvent.change(box, { target: { value: 'brendan' } });
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({
        query: expect.objectContaining({ q: 'brendan' }),
      });
    });
  });

  it('pages forward with the cursor and back again', async () => {
    const { list } = setup([manySchools()]);
    await screen.findByText('School 0');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({
        query: expect.objectContaining({ cursor: 'next-page' }),
      });
    });
    expect(await screen.findByText('Page 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Page 1')).toBeInTheDocument();
  });
});
