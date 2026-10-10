import type { MemberDetail, SchoolRole } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { buildWizardModel, changeSummary } from './role-wizard-model';

const role = (
  slug: string,
  permissions: Parameters<typeof toPermissionMap>[0]
): SchoolRole => ({
  slug,
  label: slug.slice(0, 1).toUpperCase() + slug.slice(1),
  description: null,
  source: 'starter',
  permissions: toPermissionMap(permissions),
  grantable: true,
});

const catalogue = [
  role('administrator', ['campus:readAll', 'student:read', 'student:create']),
  role('teacher', ['student:read']),
  role('principal', ['campus:readAll', 'student:read']),
  role('registrar', ['student:read', 'student:create', 'student:update']),
];

const member = (roles: string[]): MemberDetail => ({
  id: 'm1',
  userId: 'u1',
  name: 'Ada Obi',
  email: 'ada@example.test',
  username: null,
  title: 'New member',
  roles,
  campusIds: ['c1'],
  permissions: {},
  campusScope: ['c1'],
  classScope: 'all',
  lastOwner: false,
});

const model = (current: string[], draftRoles: string[]) =>
  buildWizardModel({ member: member(current), catalogue, draftRoles });

describe('buildWizardModel', () => {
  it('has roles then review when the draft reaches every campus', () => {
    expect(model(['member'], ['administrator']).steps).toEqual([
      'roles',
      'review',
    ]);
  });

  it('adds the campus step when the combined draft lacks campus:readAll', () => {
    expect(model(['member'], ['teacher']).steps).toEqual([
      'roles',
      'campuses',
      'review',
    ]);
  });

  it('needs no campus step for Administrator plus Teacher', () => {
    expect(model(['member'], ['administrator', 'teacher']).needsCampus).toBe(
      false
    );
  });

  it('keeps member in the draft and ignores it in the diff', () => {
    const draft = model(['member', 'teacher'], ['teacher']);
    expect(draft.draft).toEqual(['member', 'teacher']);
    expect(draft.changed).toBe(false);
    expect(changeSummary(draft)).toBe('No change to what they can do');
  });

  it('counts gained and lost permissions and capability lines', () => {
    const gaining = model(['member'], ['administrator']);
    expect(gaining.more).toBe(3);
    expect(gaining.fewer).toBe(0);
    expect(gaining.gained).toContain('Students: can see');
    expect(changeSummary(gaining)).toBe('3 more, 0 fewer things they can do');

    const losing = model(['member', 'administrator'], ['teacher']);
    expect(losing.fewer).toBe(2);
    expect(losing.lost).toContain('Sees every campus');
  });

  it('lists a higher level in an area as gained and not as lost', () => {
    const upgrade = model(['member', 'teacher'], ['registrar']);
    expect(upgrade.lost).toEqual([]);
    expect(upgrade.gained).toEqual([
      'Students: admit students, update them and put them in classes',
    ]);

    const downgrade = model(['member', 'registrar'], ['teacher']);
    expect(downgrade.gained).toEqual([]);
    expect(downgrade.lost).toEqual([
      'Students: admit students, update them and put them in classes',
    ]);
  });

  it('reports a combination problem with the member’s name', () => {
    expect(model(['member', 'guardian'], ['guardian', 'teacher']).combo).toBe(
      'Ada Obi is a portal user (student or guardian) and can’t be given Teacher.'
    );
  });
});
