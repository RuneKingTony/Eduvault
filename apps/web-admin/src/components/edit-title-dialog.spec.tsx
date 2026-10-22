import { screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { renderWithApi } from '../test-utils';
import { detail } from '../test-members';
import { EditTitleDialog } from './edit-title-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup(
  updateTitle = vi.fn().mockResolvedValue(detail({ title: 'Registrar' }))
) {
  const onOpenChange = vi.fn();
  renderWithApi(
    <EditTitleDialog member={detail()} open onOpenChange={onOpenChange} />,
    { members: { updateTitle } }
  );
  return { updateTitle, onOpenChange };
}

const typeTitle = async (user: UserEvent, value: string) => {
  const field = screen.getByLabelText('Job title');
  await user.clear(field);
  await user.type(field, value);
};

describe('EditTitleDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts from the current title and names the member', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'Edit Ada Obi’s job title' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Job title')).toHaveValue('Head of maths');
  });

  it('saves the new title, says so and closes', async () => {
    const user = userEvent.setup();
    const { updateTitle, onOpenChange } = setup();
    await typeTitle(user, 'Registrar');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(updateTitle).toHaveBeenCalledWith({
        params: { id: detail().id },
        body: { title: 'Registrar' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Ada Obi’s job title saved.');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sends a blank title so the server shows New member', async () => {
    const user = userEvent.setup();
    const { updateTitle } = setup();
    await typeTitle(user, '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(updateTitle).toHaveBeenCalledWith({
        params: { id: detail().id },
        body: { title: '' },
      });
    });
  });

  it('refuses more than 80 characters without calling the server', async () => {
    const user = userEvent.setup();
    const { updateTitle } = setup();
    await typeTitle(user, 'x'.repeat(81));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText('Keep the job title to 80 characters.')
    ).toBeInTheDocument();
    expect(updateTitle).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and shows the server message when it refuses', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup(
      vi
        .fn()
        .mockRejectedValue(
          new ApiError(404, { code: 'NotFound', message: 'Member not found' })
        )
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Member not found');
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
