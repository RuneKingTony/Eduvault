import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError, type CampusSummary } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { renderWithApi, starterAccess } from '../test-utils';
import { CampusesPage, describeCampuses } from './campuses-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const summary = (
  name: string,
  overrides: Partial<CampusSummary> = {}
): CampusSummary => ({
  id: `7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c${name.length}${name.slice(0, 1)}`,
  organizationId: '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22',
  name,
  address: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  principals: [],
  counts: { classes: 0, students: 0, staff: 0 },
  ...overrides,
});

const lekki = summary('Lekki', {
  address: '12 Admiralty Way',
  principals: [{ userId: 'u1', name: 'Grace Nwosu' }],
  counts: { classes: 7, students: 120, staff: 14 },
});
const ikeja = summary('Ikeja');

const apiWith = (campuses: CampusSummary[], extra: object = {}) => ({
  campuses: { summary: vi.fn().mockResolvedValue(campuses), ...extra },
});

describe('describeCampuses', () => {
  it('counts the campuses for a school-wide scope and names them otherwise', () => {
    expect(describeCampuses([lekki, ikeja], true)).toBe('2 campuses');
    expect(describeCampuses([lekki], true)).toBe('1 campus');
    expect(describeCampuses([lekki, ikeja], false)).toBe(
      'You belong to Lekki, Ikeja'
    );
  });
});

describe('CampusesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a card per campus with address, principal and figures', async () => {
    renderWithApi(
      <CampusesPage />,
      apiWith([ikeja, lekki]),
      starterAccess('administrator')
    );

    expect(await screen.findByText('2 campuses')).toBeInTheDocument();
    expect(screen.getByText('12 Admiralty Way')).toBeInTheDocument();
    expect(screen.getByText('Grace Nwosu')).toBeInTheDocument();
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    for (const label of ['Classes', 'Students', 'Staff']) {
      expect(screen.getAllByText(label)).toHaveLength(2);
    }
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(
      screen.queryByText('You only see the campuses you work on.')
    ).not.toBeInTheDocument();
  });

  it('says which campuses a scoped member belongs to and explains the limit', async () => {
    renderWithApi(
      <CampusesPage />,
      apiWith([lekki]),
      starterAccess('principal')
    );

    expect(await screen.findByText('You belong to Lekki')).toBeInTheDocument();
    expect(
      screen.getByText('You only see the campuses you work on.')
    ).toBeInTheDocument();
  });

  it('offers New campus and Edit with team:create and team:update', async () => {
    renderWithApi(
      <CampusesPage />,
      apiWith([lekki]),
      starterAccess('administrator')
    );

    expect(await screen.findByText('Lekki')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New campus' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit Lekki' })
    ).toBeInTheDocument();
  });

  it('hides New campus and Edit without those permissions', async () => {
    renderWithApi(
      <CampusesPage />,
      apiWith([lekki]),
      starterAccess('principal')
    );

    expect(await screen.findByText('Lekki')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New campus' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit Lekki' })
    ).not.toBeInTheDocument();
  });

  it('shows the empty state with New campus when there is no campus', async () => {
    renderWithApi(
      <CampusesPage />,
      apiWith([]),
      starterAccess('administrator')
    );

    expect(await screen.findByText('No campuses yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add the first campus to start adding classes and students.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'New campus' }).length
    ).toBeGreaterThan(0);
  });

  it('creates a campus and says the creator was added to it', async () => {
    const create = vi.fn().mockResolvedValue(summary('Ajah'));
    renderWithApi(
      <CampusesPage />,
      apiWith([lekki], { create }),
      starterAccess('administrator')
    );
    await screen.findByText('Lekki');

    fireEvent.click(screen.getByRole('button', { name: 'New campus' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Name'), {
      target: { value: 'Ajah' },
    });
    fireEvent.change(dialog.getByLabelText('Address'), {
      target: { value: '22 Addo Road, Ajah' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Create campus' }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        body: { name: 'Ajah', address: '22 Addo Road, Ajah' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Ajah campus created. You were added to it.'
      );
    });
  });

  it('asks for a name before calling the API', async () => {
    const create = vi.fn();
    renderWithApi(
      <CampusesPage />,
      apiWith([lekki], { create }),
      starterAccess('administrator')
    );
    await screen.findByText('Lekki');

    fireEvent.click(screen.getByRole('button', { name: 'New campus' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Create campus' }));

    expect(
      await dialog.findByText('Give the campus a name.')
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows the 409 copy under the name and keeps the dialog open', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, { code: 'Conflict', message: 'ajah already exists.' })
      );
    renderWithApi(
      <CampusesPage />,
      apiWith([lekki], { create }),
      starterAccess('administrator')
    );
    await screen.findByText('Lekki');

    fireEvent.click(screen.getByRole('button', { name: 'New campus' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Name'), {
      target: { value: 'ajah' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Create campus' }));

    expect(await dialog.findByText('ajah already exists.')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('edits a campus with its fields filled in and says it was saved', async () => {
    const update = vi.fn().mockResolvedValue(lekki);
    renderWithApi(
      <CampusesPage />,
      apiWith([lekki], { update }),
      starterAccess('administrator')
    );
    await screen.findByText('Lekki');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Lekki' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByLabelText('Name')).toHaveValue('Lekki');
    expect(dialog.getByLabelText('Address')).toHaveValue('12 Admiralty Way');
    fireEvent.change(dialog.getByLabelText('Address'), {
      target: { value: '' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        params: { id: lekki.id },
        body: { name: 'Lekki', address: null },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Campus saved.');
    });
  });
});
