import { roleLabels } from './role-labels';

describe('roleLabels', () => {
  it('joins the roles and capitalises them', () => {
    expect(roleLabels('owner,bursar')).toBe('Owner, Bursar');
  });

  it('never lists the member role', () => {
    expect(roleLabels('member,teacher')).toBe('Teacher');
  });

  it.each([undefined, null, '', 'member'])('reads %j as no roles', (role) => {
    expect(roleLabels(role)).toBe('Member, no roles');
  });
});
