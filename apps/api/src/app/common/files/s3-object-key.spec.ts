import { objectKey } from './s3-object-key';

describe('objectKey', () => {
  it('prefixes the key with the school', () => {
    expect(objectKey({ organizationId: 'org-1', key: 'file-1' })).toBe(
      'org-1/file-1'
    );
  });

  it.each([
    ['empty school', '', 'file-1'],
    ['empty key', 'org-1', ''],
    ['slash in the key', 'org-1', 'a/b'],
    ['slash in the school', 'org-1/x', 'file-1'],
    ['parent segment in the key', 'org-1', '../org-2/file-1'],
    ['dots in the school', '..', 'file-1'],
  ])('refuses %s', (_name, organizationId, key) => {
    expect(() => objectKey({ organizationId, key })).toThrow(/Refusing/);
  });
});
