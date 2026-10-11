import { isPossibleDuplicate } from './duplicates';

const ada = { firstName: 'Ada', lastName: 'Okeke', dateOfBirth: '2014-03-03' };

describe('isPossibleDuplicate', () => {
  it('ignores case and surrounding spaces', () => {
    expect(
      isPossibleDuplicate(ada, {
        firstName: ' ada ',
        lastName: 'OKEKE',
        dateOfBirth: '2014-03-03',
      })
    ).toBe(true);
  });

  it('needs the same date of birth and both names', () => {
    expect(
      isPossibleDuplicate(ada, { ...ada, dateOfBirth: '2014-03-04' })
    ).toBe(false);
    expect(isPossibleDuplicate(ada, { ...ada, firstName: 'Adaeze' })).toBe(
      false
    );
    expect(isPossibleDuplicate(ada, { ...ada, lastName: 'Eze' })).toBe(false);
  });
});
