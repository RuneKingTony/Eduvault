import { renderHook } from '@testing-library/react';
import type { EduvaultAuthClient } from '@eduvault/auth-client';
import { clearActing, startActing } from './acting-store';
import { useSchool } from './use-school';

const clientWith = (activeOrganizationId: string | null) =>
  ({
    useSession: () => ({
      data: {
        session: { activeOrganizationId },
        user: { name: 'Jude', email: 'jude@eduvault.test', image: null },
      },
    }),
    useListOrganizations: () => ({
      data: [{ id: 'o1', name: 'Lakeside Academy' }],
    }),
  }) as unknown as EduvaultAuthClient;

afterEach(() => {
  clearActing();
});

describe('useSchool', () => {
  it('names the active school from the session', () => {
    const { result } = renderHook(() => useSchool(clientWith('o1')));
    expect(result.current.schoolName).toBe('Lakeside Academy');
    expect(result.current.user.name).toBe('Jude');
  });

  it('falls back to a generic name when nothing is active', () => {
    const { result } = renderHook(() => useSchool(clientWith(null)));
    expect(result.current.schoolName).toBe('your school');
  });

  it('names the acted school, because a super admin has no active school', () => {
    startActing('s1', 'Greenfield College');
    const { result } = renderHook(() => useSchool(clientWith(null)));
    expect(result.current.schoolName).toBe('Greenfield College');
  });
});
