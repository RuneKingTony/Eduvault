import { lifeSuffix } from './statement-text';

describe('lifeSuffix', () => {
  it('adds the lifecycle after the admission number unless the student is active', () => {
    expect(lifeSuffix('active')).toBe('');
    expect(lifeSuffix('left')).toBe(' · left');
    expect(lifeSuffix('inactive')).toBe(' · inactive');
    expect(lifeSuffix('graduated')).toBe(' · graduated');
  });
});
