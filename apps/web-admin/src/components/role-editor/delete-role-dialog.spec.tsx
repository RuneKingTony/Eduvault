import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { renderWithApi } from '../../test-utils';
import { holder, role } from '../../test-roles';
import { DeleteRoleDialog } from './delete-role-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function setup(
  target: ReturnType<typeof role>,
  remove = vi.fn().mockResolvedValue({ slug: target.slug })
) {
  const onOpenChange = vi.fn();
  const onDeleted = vi.fn();
  renderWithApi(
    <DeleteRoleDialog
      role={target}
      open
      onOpenChange={onOpenChange}
      onDeleted={onDeleted}
    />,
    { roles: { remove } }
  );
  return { remove, onOpenChange, onDeleted };
}

const deleteButton = () => screen.getByRole('button', { name: 'Delete role' });

describe('DeleteRoleDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers to delete a role nobody holds', () => {
    setup(role('cashier', { label: 'Cashier' }));
    expect(
      screen.getByRole('heading', { name: 'Delete “Cashier”?' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Members can’t hold it any more. This can’t be undone.')
    ).toBeInTheDocument();
    expect(screen.getByText('Nobody holds this role.')).toBeInTheDocument();
    expect(deleteButton()).toBeEnabled();
  });

  it('gives only a count when some holders are on campuses the viewer cannot see', () => {
    setup(
      role('cashier', {
        label: 'Cashier',
        holders: [holder('Kemi Adeyemi')],
        holderCount: 3,
      })
    );
    expect(
      screen.getByText('3 people still have this role. Take it off them first.')
    ).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
  });

  it('deletes, says so, closes and leaves the page', async () => {
    const { remove, onOpenChange, onDeleted } = setup(
      role('cashier', { label: 'Cashier' })
    );
    fireEvent.click(deleteButton());
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith({ params: { slug: 'cashier' } });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Role Cashier deleted.');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it('names the holders and disables Delete while someone holds the role', () => {
    setup(
      role('cashier', {
        label: 'Cashier',
        holders: [holder('Kemi Adeyemi'), holder('Ada Obi')],
        holderCount: 2,
      })
    );
    expect(screen.getByText('This will be refused.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Kemi Adeyemi and Ada Obi still have this role. Take it off them first.'
      )
    ).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
  });

  it('gives only a count when holder names are not available', () => {
    setup(role('cashier', { holders: undefined, holderCount: 3 }));
    expect(
      screen.getByText('3 people still have this role. Take it off them first.')
    ).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
  });

  it('refuses Student and Guardian even with no holders', () => {
    setup(role('student', { label: 'Student', source: 'starter' }));
    expect(screen.getByText('Admissions use this role.')).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
  });

  it('shows the server refusal and stays open', async () => {
    const remove = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'ROLE_IN_USE',
        message: 'Kemi still has this role. Take it off them first.',
      })
    );
    const { onOpenChange, onDeleted } = setup(
      role('cashier', { label: 'Cashier' }),
      remove
    );
    fireEvent.click(deleteButton());
    expect(
      await screen.findByText(
        'Kemi still has this role. Take it off them first.'
      )
    ).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('closes on Cancel without deleting', () => {
    const { remove, onOpenChange } = setup(role('cashier'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
