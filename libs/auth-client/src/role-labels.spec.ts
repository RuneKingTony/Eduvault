import { listedRoles, roleLabel, rolesLabel } from './role-labels';

describe('rolesLabel', () => {
  it('joins the labels of starter roles and the owner', () => {
    expect(rolesLabel(['owner', 'bursar'])).toBe('Owner, Bursar');
  });

  it('falls back to the slug for a custom role', () => {
    expect(rolesLabel(['exams-officer'])).toBe('exams-officer');
    expect(roleLabel('exams-officer')).toBe('exams-officer');
  });

  it('never lists the member role', () => {
    expect(rolesLabel(['member', 'teacher'])).toBe('Teacher');
    expect(listedRoles(['member', 'teacher'])).toEqual(['teacher']);
  });

  it.each([[[]], [['member']]])('reads %j as no roles', (roles) => {
    expect(rolesLabel(roles)).toBe('Member, no roles');
  });
});
