import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampusSelect } from './campus-select';

const CAMPUSES = [
  { id: 'lekki', name: 'Lekki' },
  { id: 'ikeja', name: 'Ikeja' },
];

describe('CampusSelect', () => {
  it('renders nothing with one campus or none', () => {
    const { container, rerender } = render(
      <CampusSelect
        campuses={CAMPUSES.slice(0, 1)}
        value={undefined}
        onChange={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <CampusSelect campuses={[]} value={undefined} onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists All campuses first and shows the picked campus', () => {
    render(
      <CampusSelect campuses={CAMPUSES} value="ikeja" onChange={vi.fn()} />
    );
    const select = screen.getByRole('combobox', { name: 'Campus' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['All campuses', 'Lekki', 'Ikeja']);
    expect(select).toHaveValue('ikeja');
  });

  it('shows All campuses when nothing is picked', () => {
    render(
      <CampusSelect campuses={CAMPUSES} value={undefined} onChange={vi.fn()} />
    );
    expect(screen.getByRole('combobox', { name: 'Campus' })).toHaveValue('');
  });

  it('reports the picked campus id, and undefined for All campuses', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CampusSelect campuses={CAMPUSES} value="lekki" onChange={onChange} />
    );
    const select = screen.getByRole('combobox', { name: 'Campus' });
    await user.selectOptions(select, 'ikeja');
    expect(onChange).toHaveBeenLastCalledWith('ikeja');
    await user.selectOptions(select, '');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
