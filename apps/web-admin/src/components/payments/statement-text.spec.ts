import { FILTER_LABELS, lifeSuffix } from './statement-text';

describe('lifeSuffix', () => {
  it('adds the lifecycle after the admission number unless the student is active', () => {
    expect(lifeSuffix('active')).toBe('');
    expect(lifeSuffix('left')).toBe(' · left');
    expect(lifeSuffix('inactive')).toBe(' · inactive');
    expect(lifeSuffix('graduated')).toBe(' · graduated');
  });
});

describe('FILTER_LABELS', () => {
  it('labels every balance filter in plain words', () => {
    expect(FILTER_LABELS.owing_gone).toBe('Owing: left or graduated');
    expect(FILTER_LABELS.paid).toBe('Paid up');
  });
});
