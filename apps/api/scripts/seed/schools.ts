interface SeedCampus {
  name: string;
  address: string | null;
}

interface SeedSchool {
  slug: string;
  name: string;
  admissionPrefix: string;
  city: string;
  createdOn: string;
  /** Persona key of the owner, who creates the campuses. */
  owner: string;
  campuses: SeedCampus[];
}

export const GREENFIELD_SLUG = 'greenfield';
export const HILLTOP_SLUG = 'hilltop';
export const SUSPENDED_SLUG = 'stbrendan';

export const schools: SeedSchool[] = [
  {
    slug: GREENFIELD_SLUG,
    name: 'Greenfield College',
    admissionPrefix: 'GF',
    city: 'Lagos',
    createdOn: '2026-08-12',
    owner: 'funmi',
    campuses: [
      { name: 'Lekki', address: '14 Admiralty Way, Lekki Phase 1' },
      { name: 'Ikeja', address: '3 Oba Akran Avenue, Ikeja' },
    ],
  },
  {
    slug: HILLTOP_SLUG,
    name: 'Hilltop Academy',
    admissionPrefix: 'HA',
    city: 'Abuja',
    createdOn: '2026-08-20',
    owner: 'kola',
    campuses: [{ name: 'Main', address: null }],
  },
  {
    slug: SUSPENDED_SLUG,
    name: "St Brendan's Schools",
    admissionPrefix: 'SB',
    city: 'Ibadan',
    createdOn: '2026-09-02',
    owner: 'mary',
    campuses: [
      { name: 'Main', address: null },
      { name: 'Annex', address: null },
      { name: 'Junior', address: null },
    ],
  },
];
