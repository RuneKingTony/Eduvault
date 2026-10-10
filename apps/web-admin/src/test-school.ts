import type { SchoolProfile, SchoolSettings } from '@eduvault/api-contract';

export const profile = (
  overrides: Partial<SchoolProfile> = {}
): SchoolProfile => ({
  id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11',
  organizationId: '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22',
  name: 'Greenfield College',
  admissionPrefix: 'GF',
  slug: 'greenfield',
  city: 'Lagos',
  address: '1 Palm Road',
  phone: '08012345678',
  email: 'info@greenfield.ng',
  currency: 'NGN',
  logoFileId: null,
  logoUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

export const settings = (
  overrides: Partial<SchoolSettings> = {}
): SchoolSettings => ({
  maxGuardians: 4,
  requireGuardian: true,
  ...overrides,
});
