import { act, renderHook } from '@testing-library/react';
import { useConfirmStep } from './use-confirm-step';

describe('useConfirmStep', () => {
  it('holds what was asked until it is confirmed, then sends it once', () => {
    const run = vi.fn();
    const { result } = renderHook(() => useConfirmStep<string>(run));
    expect(result.current.target).toBeNull();

    act(() => {
      result.current.ask('pay Ada');
    });
    expect(result.current.target).toBe('pay Ada');
    expect(run).not.toHaveBeenCalled();

    act(() => {
      result.current.confirm();
      result.current.confirm();
    });
    expect(run).toHaveBeenCalledExactlyOnceWith(
      'pay Ada',
      expect.any(Function)
    );
  });

  it('forgets the target when cancelled and sends nothing', () => {
    const run = vi.fn();
    const { result } = renderHook(() => useConfirmStep<string>(run));
    act(() => {
      result.current.ask('pay Ada');
    });

    act(() => {
      result.current.cancel();
    });
    act(() => {
      result.current.confirm();
    });

    expect(result.current.target).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('closes and can send again once the request settles', () => {
    const run = vi.fn();
    const { result } = renderHook(() => useConfirmStep<string>(run));
    act(() => {
      result.current.ask('pay Ada');
    });
    act(() => {
      result.current.confirm();
    });
    const settled = run.mock.calls[0]?.[1] as () => void;

    act(() => {
      settled();
    });
    expect(result.current.target).toBeNull();

    act(() => {
      result.current.ask('pay Tobi');
    });
    act(() => {
      result.current.confirm();
    });
    expect(run).toHaveBeenCalledTimes(2);
  });
});
