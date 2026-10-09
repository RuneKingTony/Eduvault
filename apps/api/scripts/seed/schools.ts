interface SeedCampus {
  name: string;
  address: string | null;
}

interface SeedSchool {
  slug: string;
  name: string;
  currency: string;
  /** Persona key of the owner, who creates the campuses. */
  owner: string;
  campuses: SeedCampus[];
}

export const GREENFIELD_SLUG = 'greenfield';

export const schools: SeedSchool[] = [
  {
    slug: GREENFIELD_SLUG,
    name: 'Greenfield College',
    currency: 'NGN',
    owner: 'funmi',
    campuses: [
      { name: 'Lekki', address: '14 Admiralty Way, Lekki Phase 1' },
      { name: 'Ikeja', address: '3 Oba Akran Avenue, Ikeja' },
    ],
  },
  {
    slug: 'hilltop',
    name: 'Hilltop Academy',
    currency: 'NGN',
    owner: 'kola',
    campuses: [{ name: 'Main', address: null }],
  },
  {
    slug: 'stbrendan',
    name: "St Brendan's Schools",
    currency: 'NGN',
    owner: 'mary',
    campuses: [
      { name: 'Main', address: null },
      { name: 'Annex', address: null },
      { name: 'Junior', address: null },
    ],
  },
];
