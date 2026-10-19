import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('reports the picked term and undefined for the whole history', () => {
    const onChange = vi.fn();
    render(<TermSelect terms={TERMS} value={undefined} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Term' });
    fireEvent.change(select, { target: { value: 'second' } });
    expect(onChange).toHaveBeenLastCalledWith('second');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
