import { screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { ApiError, type CreateMemberInput } from '@eduvault/api-contract';
import { renderWithApi } from '../test-utils';
import { IKEJA, LEKKI, detail, signedIn } from '../test-members';
import { AddMemberSheet } from './add-member-sheet';

function setup({
  campuses = [LEKKI, IKEJA],
  create = vi.fn(({ body }: { body: CreateMemberInput }) => ({
    member: detail({
      name: body.name,
      email: body.email,
      title: body.title ?? '',
      campusIds: body.campusIds,
    }),
    temporaryPassword: 'temp-pass',
  })),
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
      me: {
        get: vi.fn().mockResolvedValue(signedIn({ activeCampusId: LEKKI.id })),
      },
    }
  );
  return { create, onAdded, onOpenCampuses };
}

const fill = async (user: UserEvent, label: string, value: string) => {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, value);
};

describe('AddMemberSheet', () => {
  it('ticks the active campus and sends the form', async () => {
    const user = userEvent.setup();
    const { create, onAdded } = setup();
    const lekki = await screen.findByRole('checkbox', { name: /Lekki/ });
    await waitFor(() => {
      expect(lekki).toBeChecked();
    });
    expect(screen.getByRole('checkbox', { name: /Ikeja/ })).not.toBeChecked();

    await fill(user, 'Full name', ' New Hire ');
    await fill(user, 'Email', 'New.Hire@Example.test');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

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
      expect(onAdded).toHaveBeenCalledTimes(1);
    });
    expect(onAdded.mock.lastCall?.[0]).toMatchObject({
      member: { name: 'New Hire', email: 'new.hire@example.test' },
      temporaryPassword: 'temp-pass',
    });
  });

  it('shows the inline validation messages and sends nothing', async () => {
    const user = userEvent.setup();
    const { create } = setup();
    await screen.findByRole('checkbox', { name: /Lekki/ });
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Lekki/ })).toBeChecked();
    });
    await user.click(screen.getByRole('checkbox', { name: /Lekki/ }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Enter their full name.')
    ).toBeInTheDocument();
    expect(screen.getByText('Enter their email address.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one campus.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows the already-on-the-list message under Email', async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message: 'ada@example.test is already on the staff list.',
      })
    );
    setup({ create });
    await screen.findByRole('checkbox', { name: /Lekki/ });
    await fill(user, 'Full name', 'Ada Obi');
    await fill(user, 'Email', 'ada@example.test');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('ada@example.test is already on the staff list.')
    ).toBeInTheDocument();
  });

  it('asks for a campus first when the school has none', async () => {
    const user = userEvent.setup();
    const { onOpenCampuses } = setup({ campuses: [] });
    expect(await screen.findByText('Add a campus first')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create account' })
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Go to Campuses' }));
    expect(onOpenCampuses).toHaveBeenCalled();
  });
});
