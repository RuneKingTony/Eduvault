import { APIError } from 'better-auth/api';
import { isSlugConflict } from './slug-conflict';

describe('isSlugConflict', () => {
  it('recognises Better Auth’s duplicate-slug answer', () => {
    const error = new APIError('BAD_REQUEST', {
      code: 'ORGANIZATION_ALREADY_EXISTS',
      message: 'taken',
    });
    expect(isSlugConflict(error)).toBe(true);
  });

  it('recognises a unique violation on the slug, also when wrapped', () => {
    const violation = { code: '23505', constraint: 'organization_slug_key' };
    expect(isSlugConflict(violation)).toBe(true);
    expect(isSlugConflict(new Error('failed', { cause: violation }))).toBe(
      true
    );
  });

  it('ignores other failures', () => {
    expect(
      isSlugConflict({ code: '23505', constraint: 'school_account_pkey' })
    ).toBe(false);
    expect(isSlugConflict(new Error('role insert refused'))).toBe(false);
    expect(isSlugConflict(undefined)).toBe(false);
  });
});
