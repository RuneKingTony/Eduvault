import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { auditRow, renderWithApi } from '../test-utils';
import { PlatformAuditPage } from './platform-audit-page';

function setup(items = [auditRow()], nextCursor: string | null = null) {
  const list = vi.fn().mockResolvedValue({ items, nextCursor });
  const options = vi.fn().mockResolvedValue({
    items: [
      { id: 's1', name: 'Greenfield College' },
      { id: 's2', name: 'Hilltop Academy' },
    ],
  });
  renderWithApi(<PlatformAuditPage />, {
    platform: { audit: { list }, schools: { options } },
  });
  return { list };
}

describe('PlatformAuditPage', () => {
  it('has the title, description and the six columns', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: 'Audit log' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Every request a super admin makes while acting inside a school, and every platform action.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Reads are logged too. Rows are kept until a retention period is agreed.',
      })
    ).toBeInTheDocument();
    for (const heading of [
      'Time',
      'Actor',
      'School',
      'Request',
      'Status',
      'Reason',
    ]) {
      expect(
        await screen.findByRole('columnheader', { name: heading })
      ).toBeInTheDocument();
    }
  });

  it('shows a request row: Lagos time, actor, school, method, path, status and reason', async () => {
    setup([
      auditRow({
        method: 'PATCH',
        path: '/students/s9?x=1',
        status: 200,
        reason: 'SUP-2207',
      }),
      auditRow({ id: 'a2', status: 403, reason: null }),
    ]);
    const [time] = await screen.findAllByText('2026-10-07 10:05');
    expect(time).toHaveClass('font-mono');
    expect(screen.getAllByText('Jude')).toHaveLength(2);
    expect(screen.getAllByText('Greenfield College').length).toBeGreaterThan(0);
    expect(screen.getByText('PATCH')).toBeInTheDocument();
    expect(screen.getByText('/students/s9?x=1')).toHaveClass('font-mono');
    expect(screen.getByText('200')).toHaveClass('text-success');
    expect(screen.getByText('403')).toHaveClass('text-destructive');
    expect(screen.getByText('SUP-2207').tagName).toBe('CODE');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows a platform action with no school on a failed create', async () => {
    setup([
      auditRow({
        kind: 'platform',
        method: null,
        action: 'school.create',
        path: '/platform/schools',
        status: 500,
        school: null,
      }),
    ]);
    expect(await screen.findByText('school.create')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('says there are no acting requests yet', async () => {
    setup([]);
    expect(
      await screen.findByText('No acting requests yet')
    ).toBeInTheDocument();
  });

  it('filters by school and by writes only through the query', async () => {
    const { list } = setup();
    const select = await screen.findByLabelText('School');
    expect(
      within(select).getByRole('option', { name: 'All schools' })
    ).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Hilltop Academy' });

    fireEvent.change(select, { target: { value: 's2' } });
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({
        query: expect.objectContaining({ schoolId: 's2' }),
      });
    });

    fireEvent.click(screen.getByRole('switch', { name: 'Writes only' }));
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({
        query: expect.objectContaining({ schoolId: 's2', writesOnly: true }),
      });
    });

    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({
        query: expect.not.objectContaining({ schoolId: expect.anything() }),
      });
    });
  });

  it('pages with the cursor', async () => {
    const { list } = setup([auditRow()], 'c2');
    const next = await screen.findByRole('button', { name: 'Next' });
    await waitFor(() => {
      expect(next).toBeEnabled();
    });
    fireEvent.click(next);
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({
        query: expect.objectContaining({ cursor: 'c2' }),
      });
    });
  });
});
