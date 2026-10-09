import { BadRequestException } from '@nestjs/common';
import { encodeActingReason } from '@eduvault/api-contract';
import {
  ACTIONS,
  RESOURCES,
  can,
  holds,
  type Permission,
} from '@eduvault/policy';
import { actingPermissions, isWriteMethod, parseActingReason } from './acting';

describe('isWriteMethod', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])('%s writes', (method) => {
    expect(isWriteMethod(method)).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('%s only reads', (method) => {
    expect(isWriteMethod(method)).toBe(false);
  });
});

describe('actingPermissions', () => {
  const everyPermission = RESOURCES.flatMap((resource) =>
    ACTIONS.map((action) => `${resource}:${action}` as Permission)
  );

  it('holds every read and readAll, and nothing that writes, without a reason', () => {
    const map = actingPermissions(false);
    expect(can(map, 'student', 'read')).toBe(true);
    expect(can(map, 'campus', 'readAll')).toBe(true);
    expect(can(map, 'team', 'read')).toBe(true);
    const writes = everyPermission.filter(
      (permission) =>
        !permission.endsWith(':read') && !permission.endsWith(':readAll')
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.filter((permission) => holds(map, permission))).toEqual([]);
  });

  it('holds no readOwn permission', () => {
    const map = actingPermissions(false);
    expect(Object.values(map).flat()).not.toContain('readOwn');
  });

  it('holds every permission with a reason', () => {
    const map = actingPermissions(true);
    expect(can(map, 'student', 'create')).toBe(true);
    expect(can(map, 'team', 'delete')).toBe(true);
    expect(can(map, 'schoolAccount', 'update')).toBe(true);
  });
});

describe('parseActingReason', () => {
  it('counts an absent or blank header as no reason', () => {
    expect(parseActingReason(undefined)).toBeNull();
    expect(parseActingReason('')).toBeNull();
    expect(parseActingReason('   ')).toBeNull();
  });

  it('counts a header that is blank only once decoded as no reason', () => {
    expect(parseActingReason('%20%20')).toBeNull();
  });

  it('trims the reason and takes the first of repeated headers', () => {
    expect(parseActingReason('  SUP-2207 fix  ')).toBe('SUP-2207 fix');
    expect(parseActingReason(['SUP-1', 'SUP-2'])).toBe('SUP-1');
  });

  it('decodes a percent-encoded reason, so non-Latin-1 text survives the header', () => {
    expect(parseActingReason(encodeActingReason('Parent – fix 👍'))).toBe(
      'Parent – fix 👍'
    );
    expect(parseActingReason(encodeActingReason('100% done'))).toBe(
      '100% done'
    );
  });

  it('measures the length on the decoded text', () => {
    expect(parseActingReason(encodeActingReason('é'.repeat(200)))).toHaveLength(
      200
    );
    expect(() =>
      parseActingReason(encodeActingReason('é'.repeat(201)))
    ).toThrow(BadRequestException);
  });

  it('refuses a malformed percent-encoding', () => {
    expect(() => parseActingReason('50% off')).toThrow(BadRequestException);
  });

  it('accepts exactly 200 characters and refuses 201', () => {
    expect(parseActingReason('a'.repeat(200))).toHaveLength(200);
    expect(() => parseActingReason('a'.repeat(201))).toThrow(
      BadRequestException
    );
  });
});
