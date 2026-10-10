import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { renderWithApi } from '../test-utils';
import { IKEJA, LEKKI, detail } from '../test-members';
import { AddMemberSheet } from './add-member-sheet';

function setup({
  campuses = [LEKKI, IKEJA],
  create = vi.fn().mockResolvedValue({
    member: detail(),
    temporaryPassword: 'temp-pass',
  }),
}: { campuses?: unknown[]; create?: ReturnType<typeof vi.fn> } = {}) {
  const onAdded = vi.fn();
  const onOpenCampuses = vi.fn();
  renderWithApi(
    <AddMemberSheet
      open
      onOpenChange={vi.fn()}
      onAdded={onAdded}
      onOpenCampuses={onOpenCampuses}
    />,
    {
      members: { create },
      campuses: { list: vi.fn().mockResolvedValue(campuses) },
      me: { get: vi.fn().mockResolvedValue({ activeCampusId: LEKKI.id }) },
    }
  );
  return { create, onAdded, onOpenCampuses };
}

const fill = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('AddMemberSheet', () => {
  it('ticks the active campus and sends the form', async () => {
    const { create, onAdded } = setup();
    const lekki = await screen.findByRole('checkbox', { name: /Lekki/ });
    await waitFor(() => {
      expect(lekki).toBeChecked();
    });
    expect(screen.getByRole('checkbox', { name: /Ikeja/ })).not.toBeChecked();

    fill('Full name', ' New Hire ');
    fill('Email', 'New.Hire@Example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        body: {
          name: 'New Hire',
          email: 'new.hire@example.test',
          title: '',
          campusIds: [LEKKI.id],
        },
      });
    });
    await waitFor(() => {
      expect(onAdded).toHaveBeenCalled();
    });
  });

  it('shows the inline validation messages and sends nothing', async () => {
    const { create } = setup();
    await screen.findByRole('checkbox', { name: /Lekki/ });
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Lekki/ })).toBeChecked();
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Lekki/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Enter their full name.')
    ).toBeInTheDocument();
    expect(screen.getByText('Enter their email address.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one campus.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows the already-on-the-list message under Email', async () => {
    const create = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'ada@example.test is already on the staff list.',
      })
    );
    setup({ create });
    await screen.findByRole('checkbox', { name: /Lekki/ });
    fill('Full name', 'Ada Obi');
    fill('Email', 'ada@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('ada@example.test is already on the staff list.')
    ).toBeInTheDocument();
  });

  it('asks for a campus first when the school has none', async () => {
    const { onOpenCampuses } = setup({ campuses: [] });
    expect(await screen.findByText('Add a campus first')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create account' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Campuses' }));
    expect(onOpenCampuses).toHaveBeenCalled();
  });
});
