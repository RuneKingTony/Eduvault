export const SEEDED_ACTING_REASON = 'SUP-2207';

export const seededActingRequests = [
  { method: 'GET', path: '/students', status: 200, reason: null },
  { method: 'GET', path: '/campuses', status: 200, reason: null },
  {
    method: 'PATCH',
    path: '/school-account',
    status: 200,
    reason: SEEDED_ACTING_REASON,
  },
] as const;
