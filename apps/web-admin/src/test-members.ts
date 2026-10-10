import type {
  Campus,
  MemberDetail,
  MemberSummary,
  SchoolRole,
} from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';

export const LEKKI: Campus = {
  id: '7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c33',
  organizationId: '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22',
  name: 'Lekki',
  address: '1 Admiralty Way',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const IKEJA: Campus = {
  ...LEKKI,
  id: '8e0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c44',
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
  id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11',
  userId: 'user-1',
  name: 'Ada Obi',
  email: 'ada@example.test',
  username: null,
  title: 'Head of maths',
  roles: ['member'],
  campusIds: [LEKKI.id],
  ...overrides,
});

export const detail = (
  overrides: Partial<MemberDetail> = {}
): MemberDetail => ({
  ...summary(),
  permissions: {},
  campusScope: [LEKKI.id],
  classScope: 'all',
  lastOwner: false,
  ...overrides,
});
