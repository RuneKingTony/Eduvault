import type { PortalChild } from '@eduvault/api-contract';
import { childParam, selectChild } from './selected-child';

const child = (id: string, firstName: string): PortalChild => ({
  id,
  firstName,
  lastName: 'Okeke',
  className: null,
  campusName: 'Lekki',
  archived: false,
});

const ada = child('a', 'Ada');
const tobi = child('t', 'Tobi');

describe('selectChild', () => {
  it('picks the linked child named by the param', () => {
    expect(selectChild([ada, tobi], 't')).toBe(tobi);
  });

  it('falls back to the first child with no param', () => {
    expect(selectChild([ada, tobi], undefined)).toBe(ada);
  });

  it('falls back to the first child for an id that is not linked', () => {
    expect(selectChild([ada, tobi], 'someone-else')).toBe(ada);
  });

  it('is undefined with no children', () => {
    expect(selectChild([], 'a')).toBeUndefined();
  });
});

describe('childParam', () => {
  it('keeps a non-empty string and drops everything else', () => {
    expect(childParam('a')).toBe('a');
    expect(childParam('')).toBeUndefined();
    expect(childParam(3)).toBeUndefined();
    expect(childParam(undefined)).toBeUndefined();
  });
});
