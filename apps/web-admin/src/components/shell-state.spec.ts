import { act, renderHook } from '@testing-library/react';
import { useCollapsedGroups, useRailOpen } from './shell-state';

describe('shell state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts expanded with every group open', () => {
    expect(renderHook(() => useRailOpen()).result.current[0]).toBe(true);
    expect(
      renderHook(() => useCollapsedGroups()).result.current.isCollapsed(
        'people'
      )
    ).toBe(false);
  });

  it('remembers a collapsed rail', () => {
    const { result } = renderHook(() => useRailOpen());
    act(() => {
      result.current[1](false);
    });
    expect(result.current[0]).toBe(false);
    expect(renderHook(() => useRailOpen()).result.current[0]).toBe(false);
  });

  it('remembers collapsed groups and opens them again', () => {
    const { result } = renderHook(() => useCollapsedGroups());
    act(() => {
      result.current.toggle('people');
    });
    expect(result.current.isCollapsed('people')).toBe(true);
    expect(
      renderHook(() => useCollapsedGroups()).result.current.isCollapsed(
        'people'
      )
    ).toBe(true);
    act(() => {
      result.current.toggle('people');
    });
    expect(result.current.isCollapsed('people')).toBe(false);
  });

  it('defaults to expanded when storage cannot be read or holds junk', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(renderHook(() => useRailOpen()).result.current[0]).toBe(true);
    expect(
      renderHook(() => useCollapsedGroups()).result.current.isCollapsed(
        'people'
      )
    ).toBe(false);
  });

  it('ignores a stored value that is not a list of ids', () => {
    localStorage.setItem('eduvault.nav-groups', '{"people":true}');
    expect(
      renderHook(() => useCollapsedGroups()).result.current.isCollapsed(
        'people'
      )
    ).toBe(false);
    localStorage.setItem('eduvault.nav-groups', 'not json');
    expect(
      renderHook(() => useCollapsedGroups()).result.current.isCollapsed(
        'people'
      )
    ).toBe(false);
  });

  it('still changes state when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useRailOpen());
    act(() => {
      result.current[1](false);
    });
    expect(result.current[0]).toBe(false);
  });
});
