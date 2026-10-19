import type {
  Campus,
  Me,
  MemberDetail,
  MemberSummary,
  SchoolRole,
} from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { testId } from './test-api';

const SCHOOL_ID = testId(0xd0_01);
const LEKKI_ID = testId(0xd0_02);
export const IKEJA_ID = testId(0xd0_03);
export const ADA_ID = testId(0xd0_10);
export const FUNMI_ID = testId(0xd0_11);
export const TUNDE_ID = testId(0xd0_12);
export const KEMI_ID = testId(0xd0_13);
export const EMEKA_ID = testId(0xd0_14);

export const LEKKI: Campus = {
  id: LEKKI_ID,
  organizationId: SCHOOL_ID,
  name: 'Lekki',
  address: '1 Admiralty Way',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const IKEJA: Campus = {
  ...LEKKI,
  id: IKEJA_ID,
  name: 'Ikeja',
  address: null,
};

const role = (
  base: Pick<SchoolRole, 'slug' | 'label' | 'source'>,
  permissions: Parameters<typeof toPermissionMap>[0],
  grantable = true
): SchoolRole => ({
  ...base,
  description: null,
  permissions: toPermissionMap(permissions),
  grantable,
});

export const CATALOGUE: SchoolRole[] = [
  role({ slug: 'owner', label: 'Owner', source: 'code' }, [], false),
  role({ slug: 'member', label: 'Member', source: 'code' }, []),
  role({ slug: 'administrator', label: 'Administrator', source: 'starter' }, [
    'campus:readAll',
    'student:read',
    'member:read',
  ]),
  role({ slug: 'teacher', label: 'Teacher', source: 'starter' }, [
    'student:read',
  ]),
  role({ slug: 'front-desk', label: 'Front desk', source: 'custom' }, [
    'student:read',
  ]),
];

export const summary = (
  overrides: Partial<MemberSummary> = {}
): MemberSummary => ({
  id: ADA_ID,
  userId: 'user-1',
  name: 'Ada Obi',
  email: 'ada@example.test',
  username: null,
  title: 'Head of maths',
  roles: ['member'],
  campusIds: [LEKKI.id],
  onLeave: false,
  ...overrides,
});

export const detail = (
  overrides: Partial<MemberDetail> = {}
): MemberDetail => ({
  ...summary(),
  permissions: {},
  campusScope: [LEKKI.id],
  classScope: 'all',
  classes: [],
  lastOwner: false,
  ...overrides,
});

export const signedIn = (overrides: Partial<Me> = {}): Me => ({
  user: { id: 'user-1', email: 'ada@example.test', name: 'Ada Obi' },
  activeOrganizationId: SCHOOL_ID,
  activeCampusId: null,
  mustChangePassword: false,
  platformRole: null,
  schoolCount: 1,
  suspendedSchool: null,
  ...overrides,
});
