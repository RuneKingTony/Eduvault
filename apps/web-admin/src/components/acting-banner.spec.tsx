import { fireEvent, render, screen } from '@testing-library/react';
import { allowWrites, clearActing, startActing } from '../acting-store';
import { ActingBanner } from './acting-banner';

const actions = vi.hoisted(() => ({
  start: vi.fn(),
  allow: vi.fn(),
  back: vi.fn(),
  leave: vi.fn(),
}));

vi.mock('../acting-actions', () => ({ useActingActions: () => actions }));

beforeEach(() => {
  vi.clearAllMocks();
  clearActing();
});

describe('ActingBanner', () => {
  it('is not there when not acting', () => {
    render(<ActingBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reads read-only with a reason field and Leave school', () => {
    startActing('s1', 'Greenfield College');
    render(<ActingBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Acting in Greenfield College');
    expect(banner).toHaveTextContent('Read-only. Every request is audited.');
    const reason = screen.getByLabelText('Reason for writes');
    expect(reason).toHaveAttribute('placeholder', 'Reason, e.g. SUP-2214');
    expect(reason).toBeRequired();
    expect(reason).toHaveAttribute('maxlength', '200');
    expect(screen.getByRole('button', { name: 'Allow writes' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Back to read-only' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave school' }));
    expect(actions.leave).toHaveBeenCalledOnce();
  });

  it('allows writes with the reason that was typed', () => {
    startActing('s1', 'Greenfield College');
    render(<ActingBanner />);
    fireEvent.change(screen.getByLabelText('Reason for writes'), {
      target: { value: 'SUP-2214' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Allow writes' }));
    expect(actions.allow).toHaveBeenCalledExactlyOnceWith('SUP-2214');
  });

  it('keeps Allow writes off for a blank reason', () => {
    startActing('s1', 'Greenfield College');
    render(<ActingBanner />);
    fireEvent.change(screen.getByLabelText('Reason for writes'), {
      target: { value: '   ' },
    });
    expect(screen.getByRole('button', { name: 'Allow writes' })).toBeDisabled();
  });

  it('reads writes allowed with the reason and offers Back to read-only', () => {
    startActing('s1', 'Greenfield College');
    allowWrites('SUP-2214');
    render(<ActingBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Writes allowed. Reason SUP-2214'
    );
    expect(
      screen.queryByLabelText('Reason for writes')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to read-only' }));
    expect(actions.back).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Leave school' }));
    expect(actions.leave).toHaveBeenCalledOnce();
  });

  it.each([
    ['read-only', () => undefined, 'Leave school'],
    ['writes allowed', () => allowWrites('SUP-2214'), 'Back to read-only'],
  ])('keeps its buttons legible on the warning tint (%s)', (_, setup, name) => {
    startActing('s1', 'Greenfield College');
    setup();
    const { container } = render(<ActingBanner />);
    expect(container.firstChild).toHaveClass('text-warning-ink');
    expect(container.firstChild).not.toHaveClass('text-warning-foreground');
    expect(screen.getByRole('button', { name })).toHaveClass('text-foreground');
    expect(screen.getByRole('button', { name: 'Leave school' })).toHaveClass(
      'text-foreground'
    );
  });
});
