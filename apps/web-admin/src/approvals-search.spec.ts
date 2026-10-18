import { parseApprovalsSearch } from './approvals-search';

describe('parseApprovalsSearch', () => {
  it('keeps the money and leave tabs', () => {
    expect(parseApprovalsSearch({ tab: 'leave' }).tab).toBe('leave');
    expect(parseApprovalsSearch({ tab: 'money' }).tab).toBe('money');
  });

  it('drops anything else, which means the All tab', () => {
    expect(parseApprovalsSearch({ tab: 'all' }).tab).toBeUndefined();
    expect(parseApprovalsSearch({}).tab).toBeUndefined();
    expect(parseApprovalsSearch({ tab: 3 }).tab).toBeUndefined();
  });

  it('keeps a campus id and drops a blank or non-text one', () => {
    expect(parseApprovalsSearch({ campus: 'lekki' }).campus).toBe('lekki');
    expect(parseApprovalsSearch({ campus: '' }).campus).toBeUndefined();
    expect(parseApprovalsSearch({ campus: ['a'] }).campus).toBeUndefined();
    expect(parseApprovalsSearch({}).campus).toBeUndefined();
  });
});
