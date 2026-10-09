import type { ReactNode } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import { accessOfStarter, fakeAccess } from './access-test-utils';
import {
  Can,
  PermissionsProvider,
  useCan,
  useCanAny,
  usePermissions,
} from './permissions';

const wrapperFor = (value = accessOfStarter('bursar')) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <PermissionsProvider value={value}>{children}</PermissionsProvider>;
  };

describe('permissions', () => {
  it('answers a single permission', () => {
    const wrapper = wrapperFor();
    expect(
      renderHook(() => useCan('student', 'read'), { wrapper }).result.current
    ).toBe(true);
    expect(
      renderHook(() => useCan('student', 'create'), { wrapper }).result.current
    ).toBe(false);
  });

  it('passes an any-of gate with one permission', () => {
    const wrapper = wrapperFor();
    expect(
      renderHook(() => useCanAny(['team:read', 'student:read']), { wrapper })
        .result.current
    ).toBe(true);
    expect(
      renderHook(() => useCanAny(['team:read', 'schoolAccount:read']), {
        wrapper,
      }).result.current
    ).toBe(false);
  });

  it('exposes the value it was given', () => {
    const value = fakeAccess({ roles: ['member', 'teacher'] });
    const { result } = renderHook(() => usePermissions(), {
      wrapper: wrapperFor(value),
    });
    expect(result.current).toBe(value);
  });

  it('refuses to be read outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => usePermissions())).toThrow(
      'usePermissions needs a PermissionsProvider'
    );
  });

  it('renders <Can> children only for a held permission', () => {
    render(
      <PermissionsProvider value={accessOfStarter('bursar')}>
        <Can permission="student:read">
          <p>can read</p>
        </Can>
        <Can permission="student:create">
          <p>can create</p>
        </Can>
        <Can anyOf={['student:create', 'student:read']}>
          <p>can do one</p>
        </Can>
        <Can anyOf={['student:create', 'team:read']}>
          <p>can do none</p>
        </Can>
      </PermissionsProvider>
    );
    expect(screen.getByText('can read')).toBeInTheDocument();
    expect(screen.getByText('can do one')).toBeInTheDocument();
    expect(screen.queryByText('can create')).not.toBeInTheDocument();
    expect(screen.queryByText('can do none')).not.toBeInTheDocument();
  });
});
