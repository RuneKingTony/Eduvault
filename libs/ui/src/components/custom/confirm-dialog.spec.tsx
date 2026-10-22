import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog';

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

const base: ConfirmDialogProps = {
  open: true,
  title: 'Record this payment?',
  description: 'It posts at once and issues a receipt.',
  details: [
    { label: 'Student', value: 'Ada Obi' },
    { label: 'Amount', value: '₦5,000' },
  ],
  confirmLabel: 'Record payment',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

const show = (props: Partial<ConfirmDialogProps> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      {...base}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onConfirm, onCancel };
};

describe('ConfirmDialog', () => {
  it('shows the title, the student and the amount', () => {
    show();
    expect(
      screen.getByRole('dialog', { name: 'Record this payment?' })
    ).toBeInTheDocument();
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.getByText('₦5,000')).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    show({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms with an empty reason when none is asked for', async () => {
    const { onConfirm } = show();
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('');
  });

  it('cancels without confirming', async () => {
    const { onConfirm, onCancel } = show();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('refuses a blank reason and sends the trimmed one', async () => {
    const reason = {
      label: 'Reason',
      placeholder: 'The person who asked will see this',
      missing: 'Say why you are declining.',
    };
    const { onConfirm } = show({
      reason,
      confirmLabel: 'Decline',
      tone: 'destructive',
    });
    await user.type(screen.getByLabelText('Reason'), '   ');
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.getByText('Say why you are declining.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reason'), ' Wrong child ');
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('Wrong child');
  });

  it('disables both buttons and shows a failure while it works', () => {
    show({ pending: true, error: new Error('The bank is unreachable') });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Record payment' })
    ).toBeDisabled();
    expect(screen.getByText('The bank is unreachable')).toBeInTheDocument();
  });

  it('shows a note under the details', () => {
    show({ note: 'Posts the refund from the money account.' });
    expect(
      screen.getByText('Posts the refund from the money account.')
    ).toBeVisible();
  });

  it('forgets a typed reason when it is closed and opened again', async () => {
    const reason = { label: 'Reason', missing: 'Say why.' };
    const props = { ...base, reason, onConfirm: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(<ConfirmDialog {...props} />);
    await user.type(screen.getByLabelText('Reason'), 'Wrong child');

    rerender(<ConfirmDialog {...props} open={false} />);
    rerender(<ConfirmDialog {...props} open />);

    expect(screen.getByLabelText('Reason')).toHaveValue('');
  });

  it('cancels on Escape', async () => {
    const { onCancel } = show();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
