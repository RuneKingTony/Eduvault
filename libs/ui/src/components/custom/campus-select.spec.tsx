import { fireEvent, render, screen } from '@testing-library/react';
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
      [...select.querySelectorAll('option')].map((option) => option.textContent)
    ).toEqual(['All campuses', 'Lekki', 'Ikeja']);
    expect(select).toHaveValue('ikeja');
  });

  it('shows All campuses when nothing is picked', () => {
    render(
      <CampusSelect campuses={CAMPUSES} value={undefined} onChange={vi.fn()} />
    );
    expect(screen.getByRole('combobox', { name: 'Campus' })).toHaveValue('');
  });

  it('reports the picked campus id, and undefined for All campuses', () => {
    const onChange = vi.fn();
    render(
      <CampusSelect campuses={CAMPUSES} value="lekki" onChange={onChange} />
    );
    const select = screen.getByRole('combobox', { name: 'Campus' });
    fireEvent.change(select, { target: { value: 'ikeja' } });
    expect(onChange).toHaveBeenLastCalledWith('ikeja');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('passes className to the select wrapper', () => {
    render(
      <CampusSelect
        campuses={CAMPUSES}
        value={undefined}
        onChange={vi.fn()}
        className="w-40"
      />
    );
    expect(
      screen.getByRole('combobox', { name: 'Campus' }).parentElement
    ).toHaveClass('w-40');
  });
});
