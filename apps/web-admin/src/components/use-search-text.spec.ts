import { act, renderHook } from '@testing-library/react';
import { SEARCH_DELAY_MS } from '../use-debounced';
import { useSearchText } from './use-search-text';

const setup = (q?: string) => {
  const apply = vi.fn();
  const view = renderHook(
    (props: { q: string | undefined }) => useSearchText(props.q, apply),
    { initialProps: { q } }
  );
  return { apply, ...view };
};

const type = (
  result: { current: { onTextChange: (text: string) => void } },
  text: string
) => {
  act(() => {
    result.current.onTextChange(text);
  });
};

describe('useSearchText', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the text in the URL and sends nothing', () => {
    const { result, apply } = setup('ada');

    expect(result.current.text).toBe('ada');
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS * 2);
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it('shows each keystroke at once and sends the last one after the pause', () => {
    const { result, apply } = setup();

    type(result, 'a');
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS - 1);
    });
    type(result, 'ad');
    type(result, 'ada');

    expect(result.current.text).toBe('ada');
    expect(apply).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });
    expect(apply).toHaveBeenCalledExactlyOnceWith('ada');
  });

  it('sends the trimmed text, and undefined for an empty or blank one', () => {
    const { result, apply } = setup('ada');

    type(result, '  ada obi ');
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });
    type(result, '   ');
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });
    type(result, '');
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });

    expect(apply.mock.calls).toEqual([['ada obi'], [undefined], [undefined]]);
  });

  it('keeps what is typed when the URL echoes what this box sent', () => {
    const { result, apply, rerender } = setup();

    type(result, 'ada ');
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });
    rerender({ q: 'ada' });
    type(result, 'ada o');

    expect(apply).toHaveBeenCalledExactlyOnceWith('ada');
    expect(result.current.text).toBe('ada o');
  });

  it('shows a change to the URL that this box did not send', () => {
    const { result, rerender } = setup('ada');

    rerender({ q: undefined });
    expect(result.current.text).toBe('');

    rerender({ q: 'obi' });
    expect(result.current.text).toBe('obi');
  });

  it('sends nothing after it is removed', () => {
    const { result, apply, unmount } = setup();

    type(result, 'ada');
    unmount();
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS * 2);
    });

    expect(apply).not.toHaveBeenCalled();
  });
});
