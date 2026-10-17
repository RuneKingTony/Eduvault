import { parseApprovalsSearch } from './approvals-search';

describe('parseApprovalsSearch', () => {
  it('keeps the money and leave tabs', () => {
    expect(parseApprovalsSearch({ tab: 'leave' })).toEqual({ tab: 'leave' });
    expect(parseApprovalsSearch({ tab: 'money' })).toEqual({ tab: 'money' });
  });

  it('drops anything else, which means the All tab', () => {
    expect(parseApprovalsSearch({ tab: 'all' }).tab).toBeUndefined();
    expect(parseApprovalsSearch({}).tab).toBeUndefined();
    expect(parseApprovalsSearch({ tab: 3 }).tab).toBeUndefined();
  });
});
