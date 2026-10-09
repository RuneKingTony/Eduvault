import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError, type PlatformSchool } from '@eduvault/api-contract';
import { auditRow, platformSchool, renderWithApi } from '../test-utils';
import { PlatformSchoolPage } from './platform-school-page';

const setup = (
  school: PlatformSchool | Error = platformSchool(),
  audit = [auditRow()]
) => {
  const get =
    school instanceof Error
      ? vi.fn().mockRejectedValue(school)
      : vi.fn().mockResolvedValue(school);
  const list = vi.fn().mockResolvedValue({ items: audit, nextCursor: null });
  const handlers = { onActInSchool: vi.fn(), onBack: vi.fn() };
  renderWithApi(<PlatformSchoolPage schoolId="s1" {...handlers} />, {
    platform: { schools: { get }, audit: { list } },
  });
  return { get, list, ...handlers };
};

const openMoreActions = async () => {
  fireEvent.keyDown(
    await screen.findByRole('button', { name: /More actions/ }),
    {
      key: 'Enter',
    }
  );
};

describe('PlatformSchoolPage', () => {
  it('shows the school, its status, where and when it was created', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: 'Greenfield College' })
    ).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Lagos · created 12 Aug 2026')).toBeInTheDocument();
    const trail = screen.getByRole('navigation', { name: 'School' });
    expect(within(trail).getByText('Schools')).toBeInTheDocument();
    expect(within(trail).getByText('Greenfield College')).toBeInTheDocument();
  });

  it('shows a suspended school and drops the city when there is none', async () => {
    setup(platformSchool({ status: 'suspended', city: null }));
    expect(await screen.findByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('created 12 Aug 2026')).toBeInTheDocument();
  });

  it('has one owner block per owner', async () => {
    setup(
      platformSchool({
        owners: [
          { id: 'o1', name: 'Funmi Adeyemi', email: 'funmi@greenfield.test' },
          { id: 'o2', name: 'Kola Ade', email: 'kola@greenfield.test' },
        ],
      })
    );
    expect(await screen.findByText('Funmi Adeyemi')).toBeInTheDocument();
    expect(screen.getByText('funmi@greenfield.test')).toBeInTheDocument();
    expect(screen.getByText('Kola Ade')).toBeInTheDocument();
    expect(screen.getByText('kola@greenfield.test')).toBeInTheDocument();
  });

  it('explains acting in three lines', async () => {
    setup();
    await screen.findByText('Acting in a school');
    expect(screen.getByText('Read-only by default')).toBeInTheDocument();
    expect(
      screen.getByText('Every read and read-all permission, all campuses.')
    ).toBeInTheDocument();
    expect(screen.getByText('Writes need a reason')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Give a reason, such as a ticket number, to make changes.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Everything is audited')).toBeInTheDocument();
    expect(
      screen.getByText('Actor, school, method, path, status, reason, time.')
    ).toBeInTheDocument();
  });

  it('starts acting from the primary action', async () => {
    const { onActInSchool } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Act in this school' })
    );
    expect(onActInSchool).toHaveBeenCalledExactlyOnceWith({
      id: 's1',
      name: 'Greenfield College',
    });
  });

  it('lists the newest eight acting requests of this school, or says there are none', async () => {
    const { list } = setup(platformSchool(), [
      auditRow({ id: 'a1', path: '/students' }),
      auditRow({
        id: 'a2',
        path: '/campuses',
        method: 'PATCH',
        reason: 'SUP-1',
      }),
    ]);
    expect(await screen.findByText('/campuses')).toBeInTheDocument();
    expect(screen.getByText('SUP-1')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({
      query: { schoolId: 's1', kind: 'acting', limit: 8 },
    });
    expect(
      screen.queryByRole('columnheader', { name: 'School' })
    ).not.toBeInTheDocument();
  });

  it('says there are no acting requests yet', async () => {
    setup(platformSchool(), []);
    expect(
      await screen.findByText('No acting requests yet')
    ).toBeInTheDocument();
  });

  it('offers Replace owner and Suspend in the menu of an active school', async () => {
    setup();
    await openMoreActions();
    expect(
      await screen.findByRole('menuitem', { name: 'Replace owner…' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Suspend school…' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Reactivate…' })
    ).not.toBeInTheDocument();
  });

  it('offers Reactivate instead of Suspend for a suspended school', async () => {
    setup(platformSchool({ status: 'suspended' }));
    await openMoreActions();
    expect(
      await screen.findByRole('menuitem', { name: 'Reactivate…' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Suspend school…' })
    ).not.toBeInTheDocument();
  });

  it('says the school was not found and goes back', async () => {
    const { onBack } = setup(
      new ApiError(404, { code: 'NotFound', message: 'School not found' })
    );
    expect(await screen.findByText('School not found')).toBeInTheDocument();
    expect(
      screen.getByText(/We couldn’t find that school/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Greenfield College' })
      ).not.toBeInTheDocument();
    });
  });
});
