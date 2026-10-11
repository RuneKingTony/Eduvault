import { parseClassesSearch, statusOf } from './classes-search';

describe('parseClassesSearch', () => {
  it('keeps archived and all and drops anything else', () => {
    expect(parseClassesSearch({ status: 'archived' })).toEqual({
      status: 'archived',
    });
    expect(parseClassesSearch({ status: 'all' })).toEqual({ status: 'all' });
    expect(parseClassesSearch({ status: 'active' }).status).toBeUndefined();
    expect(parseClassesSearch({ status: 3 }).status).toBeUndefined();
    expect(parseClassesSearch({}).status).toBeUndefined();
  });

  it('shows active classes unless a status is chosen', () => {
    expect(statusOf({})).toBe('active');
    expect(statusOf({ status: 'archived' })).toBe('archived');
  });
});
