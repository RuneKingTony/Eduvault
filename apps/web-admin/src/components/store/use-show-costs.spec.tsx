import { fireEvent, render, screen } from '@testing-library/react';
import { SHOW_COSTS_KEY, useShowCosts } from './use-show-costs';

function Probe() {
  const [show, setShow] = useShowCosts();
  return (
    <button
      type="button"
      onClick={() => {
        setShow(!show);
      }}
    >
      {show ? 'on' : 'off'}
    </button>
  );
}

describe('useShowCosts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is off until it is switched on', () => {
    render(<Probe />);
    expect(screen.getByRole('button')).toHaveTextContent('off');
  });

  it('remembers the choice for the next visit', () => {
    const { unmount } = render(<Probe />);
    fireEvent.click(screen.getByRole('button'));
    expect(localStorage.getItem(SHOW_COSTS_KEY)).toBe('true');
    unmount();

    render(<Probe />);
    expect(screen.getByRole('button')).toHaveTextContent('on');

    fireEvent.click(screen.getByRole('button'));
    expect(localStorage.getItem(SHOW_COSTS_KEY)).toBe('false');
  });

  it('works when storage is unavailable', () => {
    const blocked = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    render(<Probe />);
    expect(screen.getByRole('button')).toHaveTextContent('off');
    blocked.mockRestore();
  });
});
