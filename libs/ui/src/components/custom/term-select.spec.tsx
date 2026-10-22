import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TermSelect } from './term-select';

const TERMS = [
  { id: 'second', label: 'Second term, 2026/2027' },
  { id: 'first', label: 'First term, 2026/2027' },
];

describe('TermSelect', () => {
  it('lists the whole history first, then the terms as given', () => {
    render(<TermSelect terms={TERMS} value="first" onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Term' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'Whole history',
      'Second term, 2026/2027',
      'First term, 2026/2027',
    ]);
    expect(select).toHaveValue('first');
  });

  it('shows the whole history when no term is picked', () => {
    render(<TermSelect terms={TERMS} value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Term' })).toHaveValue('');
  });

  it('reports the picked term and undefined for the whole history', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TermSelect terms={TERMS} value={undefined} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Term' });
    await user.selectOptions(select, 'second');
    expect(onChange).toHaveBeenLastCalledWith('second');
    await user.selectOptions(select, 'Whole history');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
