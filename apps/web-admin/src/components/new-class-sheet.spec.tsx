import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError, type Campus } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { IDS, classSummary, ladder } from '../test-classes';
import { renderWithApi } from '../test-utils';
import { NewClassSheet } from './new-class-sheet';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const campus = (id: string, name: string): Campus => ({
  id,
  organizationId: '00000000-0000-4000-8000-0000000000aa',
  name,
  address: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

function setup(activeCampusId: string | null = IDS.ikeja) {
  const created = classSummary({
    displayName: 'JSS 1 Gold',
    campus: { id: IDS.lekki, name: 'Lekki' },
  });
  const api = {
    classLevels: { list: vi.fn().mockResolvedValue(ladder()) },
    campuses: {
      list: vi
        .fn()
        .mockResolvedValue([
          campus(IDS.ikeja, 'Ikeja'),
          campus(IDS.lekki, 'Lekki'),
        ]),
    },
    me: { get: vi.fn().mockResolvedValue({ activeCampusId }) },
    classes: { create: vi.fn().mockResolvedValue(created) },
  };
  const onOpenChange = vi.fn();
  renderWithApi(<NewClassSheet open onOpenChange={onOpenChange} />, api);
  return { api, onOpenChange };
}

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Create class' }));

describe('NewClassSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains itself and starts on the first level and the active campus', async () => {
    setup();
    expect(
      await screen.findByText('New class', {
        selector: '[data-slot="sheet-title"]',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Classes belong to a campus and carry over each school year.'
      )
    ).toBeInTheDocument();
    const level = await screen.findByLabelText<HTMLSelectElement>('Level');
    expect(level).toHaveValue(IDS.p1);
    expect(
      within(level)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Primary 1', 'JSS 1', 'SS 3']);
    expect(screen.getByLabelText('Campus')).toHaveValue(IDS.ikeja);
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('falls back to the first campus when none is active', async () => {
    setup(null);
    expect(await screen.findByLabelText('Campus')).toHaveValue(IDS.ikeja);
  });

  it('creates the class, toasts with the display name and campus and closes', async () => {
    const { api, onOpenChange } = setup();
    fireEvent.change(await screen.findByLabelText('Level'), {
      target: { value: IDS.jss1 },
    });
    fireEvent.change(screen.getByLabelText('Campus'), {
      target: { value: IDS.lekki },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: ' Gold ' },
    });
    submit();
    await waitFor(() => {
      expect(api.classes.create).toHaveBeenCalledWith({
        body: { levelId: IDS.jss1, campusId: IDS.lekki, name: 'Gold' },
      });
      expect(toast.success).toHaveBeenCalledWith(
        'JSS 1 Gold created on Lekki.'
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('asks for a name before calling the API', async () => {
    const { api } = setup();
    await screen.findByLabelText('Level');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Give the class a name, for example Gold.'
    );
    expect(api.classes.create).not.toHaveBeenCalled();
  });

  it.each([
    'JSS 1 Gold already exists on Lekki.',
    'JSS 1 Gold already exists on Lekki and is archived. Restore it instead.',
  ])('shows the 409 "%s" inline and stays open', async (message) => {
    const { api, onOpenChange } = setup();
    api.classes.create.mockRejectedValue(
      new ApiError(409, { code: 'Conflict', message })
    );
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Gold' },
    });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
