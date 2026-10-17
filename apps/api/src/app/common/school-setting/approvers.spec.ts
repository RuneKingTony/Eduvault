import { toPermissionMap } from '@eduvault/policy';
import { approverLabels } from './approvers';

const row = (role: string, label: string | null, permissions: string[]) => ({
  role,
  label,
  permission: JSON.stringify(toPermissionMap(permissions as never)),
});

describe('approverLabels', () => {
  it('lists the owner first and then each role holding adjustment:approve', () => {
    expect(
      approverLabels([
        row('principal', 'Principal', [
          'adjustment:read',
          'adjustment:approve',
        ]),
        row('bursar', 'Bursar', ['adjustment:read', 'adjustment:create']),
        row('deputy', 'Deputy head', ['adjustment:approve']),
      ])
    ).toEqual(['Owner', 'Deputy head', 'Principal']);
  });

  it('is just the owner when no role can approve', () => {
    expect(
      approverLabels([row('bursar', 'Bursar', ['adjustment:create'])])
    ).toEqual(['Owner']);
  });

  it('names a role by its slug when it has no label, and never lists the owner twice', () => {
    expect(
      approverLabels([
        row('owner', 'Owner', ['adjustment:approve']),
        row('vice', null, ['adjustment:approve']),
      ])
    ).toEqual(['Owner', 'vice']);
  });
});
