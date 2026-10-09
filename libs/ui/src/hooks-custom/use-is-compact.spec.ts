import { act, renderHook } from '@testing-library/react';
import { stubMatchMedia } from '../testing/match-media';
import { useIsCompact } from './use-is-compact';

const COMPACT = '(max-width: 820px)';

describe('useIsCompact', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true at 820px and narrower', () => {
    stubMatchMedia({ [COMPACT]: true });
    expect(renderHook(() => useIsCompact()).result.current).toBe(true);
  });

  it('is false on a wider screen', () => {
    stubMatchMedia({ [COMPACT]: false });
    expect(renderHook(() => useIsCompact()).result.current).toBe(false);
  });

  it('follows the viewport as it changes', () => {
    const media = stubMatchMedia({ [COMPACT]: false });
    const { result } = renderHook(() => useIsCompact());
    act(() => {
      media.set(COMPACT, true);
    });
    expect(result.current).toBe(true);
  });
});
