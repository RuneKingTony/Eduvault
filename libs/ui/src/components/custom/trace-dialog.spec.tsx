import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceDialog } from './trace-dialog';

const facts = [
  { label: 'Monnify reference', value: 'MNFY|20|1', mono: true },
  { label: 'Signature check', value: 'Valid', mono: false },
];

describe('TraceDialog', () => {
  it('opens from the Trace button and lists each fact under its label', async () => {
    const user = userEvent.setup();
    render(<TraceDialog facts={facts} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trace' }));

    const dialog = screen.getByRole('dialog', { name: 'Trace' });
    expect(within(dialog).getByText('Monnify reference')).toBeInTheDocument();
    expect(within(dialog).getByText('MNFY|20|1')).toHaveClass('font-mono');
    expect(within(dialog).getByText('Valid')).not.toHaveClass('font-mono');
  });
});
