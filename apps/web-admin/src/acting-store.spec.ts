import { act, renderHook } from '@testing-library/react';
import {
  actingHeaders,
  allowWrites,
  backToReadOnly,
  clearActing,
  getActing,
  leaveActing,
  startActing,
  useActing,
} from './acting-store';

afterEach(() => {
  clearActing();
  vi.restoreAllMocks();
});

describe('acting store', () => {
  it('is not acting by default and sends no headers', () => {
    expect(getActing()).toBeNull();
    expect(actingHeaders()).toEqual({});
  });

  it('starts read-only, with the school header only', () => {
    startActing('school-a', 'Greenfield College');
    expect(getActing()).toEqual({
      organizationId: 'school-a',
      schoolName: 'Greenfield College',
      reason: null,
    });
    expect(actingHeaders()).toEqual({ 'x-eduvault-acting-org': 'school-a' });
  });

  it('allows writes with a trimmed reason and goes back to read-only', () => {
    startActing('school-a', 'Greenfield College');
    allowWrites('  SUP-2214  ');
    expect(getActing()?.reason).toBe('SUP-2214');
    expect(actingHeaders()).toEqual({
      'x-eduvault-acting-org': 'school-a',
      'x-eduvault-acting-reason': 'SUP-2214',
    });
    backToReadOnly();
    expect(getActing()?.reason).toBeNull();
    expect(actingHeaders()).toEqual({ 'x-eduvault-acting-org': 'school-a' });
  });

  it('percent-encodes a reason with non-Latin-1 text, so fetch accepts the header', () => {
    startActing('school-a', 'Greenfield College');
    allowWrites('Parent – fix 👍');
    const headers = actingHeaders();
    expect(headers['x-eduvault-acting-reason']).toBe(
      encodeURIComponent('Parent – fix 👍')
    );
    expect(() => new Headers(headers)).not.toThrow();
    expect(getActing()?.reason).toBe('Parent – fix 👍');
  });

  it('ignores a blank reason and does nothing when not acting', () => {
    allowWrites('SUP-1');
    expect(getActing()).toBeNull();
    startActing('school-a', 'Greenfield College');
    allowWrites('   ');
    expect(getActing()?.reason).toBeNull();
  });

  it('leaves, returning the school that was left', () => {
    startActing('school-a', 'Greenfield College');
    expect(leaveActing()).toMatchObject({ organizationId: 'school-a' });
    expect(getActing()).toBeNull();
    expect(leaveActing()).toBeNull();
  });

  it('is cleared by clearActing, as sign-out does', () => {
    startActing('school-a', 'Greenfield College');
    clearActing();
    expect(getActing()).toBeNull();
    expect(globalThis.sessionStorage.getItem('eduvault.acting')).toBeNull();
  });

  it('is per tab: it lives in sessionStorage, not localStorage', () => {
    startActing('school-a', 'Greenfield College');
    expect(globalThis.sessionStorage.getItem('eduvault.acting')).toContain(
      'school-a'
    );
    expect(globalThis.localStorage.getItem('eduvault.acting')).toBeNull();
  });

  it('reads as not acting when the storage throws', () => {
    startActing('school-a', 'Greenfield College');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getActing()).toBeNull();
    expect(actingHeaders()).toEqual({});
  });

  it('survives a storage that throws on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => {
      startActing('school-a', 'Greenfield College');
    }).not.toThrow();
  });

  it('re-renders a component when the state changes', () => {
    const { result } = renderHook(() => useActing());
    expect(result.current).toBeNull();
    act(() => {
      startActing('school-a', 'Greenfield College');
    });
    expect(result.current?.organizationId).toBe('school-a');
    act(() => {
      allowWrites('SUP-1');
    });
    expect(result.current?.reason).toBe('SUP-1');
    act(() => {
      leaveActing();
    });
    expect(result.current).toBeNull();
  });
});
