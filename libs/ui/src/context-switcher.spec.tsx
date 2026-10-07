import { fireEvent, render, screen } from '@testing-library/react';
import { ContextSwitcher } from './context-switcher';

const options = [
  { id: 'a', name: 'School A' },
  { id: 'b', name: 'School B' },
];

describe('ContextSwitcher', () => {
  it('shows the active option and reports changes', () => {
    const onChange = vi.fn();
    render(
      <ContextSwitcher
        label="School"
        options={options}
        value="a"
        onChange={onChange}
      />
    );

    expect(screen.getByLabelText('School')).toHaveValue('a');
    fireEvent.change(screen.getByLabelText('School'), {
      target: { value: 'b' },
    });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('prompts for a selection when nothing is active', () => {
    render(
      <ContextSwitcher
        label="School"
        options={options}
        value={null}
        onChange={() => undefined}
      />
    );
    expect(screen.getByRole('option', { name: 'Select…' })).toBeInTheDocument();
  });
});
