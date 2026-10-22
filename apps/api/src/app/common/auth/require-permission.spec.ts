import { ForbiddenException } from '@nestjs/common';
import { ApiError, denialMessage } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { requirePermission } from './require-permission';

const holder = { permissions: toPermissionMap(['student:create']) };

describe('requirePermission', () => {
  it('passes when the permission is held', () => {
    expect(() => {
      requirePermission(holder, 'student:create');
    }).not.toThrow();
  });

  it('refuses with a 403 the client reads as a denial', () => {
    let refusal: unknown;
    try {
      requirePermission(holder, 'guardian:create');
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(ForbiddenException);
    const message = (refusal as ForbiddenException).message;
    expect(message).toBe('Missing permission guardian:create');
    expect(
      denialMessage(new ApiError(403, { code: 'Forbidden', message }), 'denied')
    ).toBe('denied');
  });
});
