import type { PortalChild } from '@eduvault/api-contract';
import { ADA_ID, STRANGER_ID, TOBI_ID } from './test-utils';
import { childParam, selectChild } from './selected-child';

const child = (id: string, firstName: string): PortalChild => ({
  id,
  firstName,
  lastName: 'Okeke',
  className: null,
  campusName: 'Lekki',
  archived: false,
});

const ada = child(ADA_ID, 'Ada');
const tobi = child(TOBI_ID, 'Tobi');

describe('selectChild', () => {
  it('picks the linked child named by the param', () => {
    expect(selectChild([ada, tobi], TOBI_ID)).toBe(tobi);
  });

  it('falls back to the first child with no param', () => {
    expect(selectChild([ada, tobi], undefined)).toBe(ada);
  });

  it('falls back to the first child for an id that is not linked', () => {
    expect(selectChild([ada, tobi], STRANGER_ID)).toBe(ada);
  });

  it('is undefined with no children', () => {
    expect(selectChild([], ADA_ID)).toBeUndefined();
  });
});

describe('childParam', () => {
  it('keeps a non-empty string and drops everything else', () => {
    expect(childParam(ADA_ID)).toBe(ADA_ID);
    expect(childParam('')).toBeUndefined();
    expect(childParam(3)).toBeUndefined();
    expect(childParam(undefined)).toBeUndefined();
  });
});
