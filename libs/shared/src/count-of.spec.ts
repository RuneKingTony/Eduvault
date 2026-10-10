import { countOf } from './count-of';

describe('countOf', () => {
  it('uses the singular for exactly one', () => {
    expect(countOf(1, 'person', 'people')).toBe('1 person');
  });

  it('uses the plural for zero and for many', () => {
    expect(countOf(0, 'thing', 'things')).toBe('0 things');
    expect(countOf(3, 'person', 'people')).toBe('3 people');
  });
});
