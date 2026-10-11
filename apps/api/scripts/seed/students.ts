interface SeedGuardianLink {
  guardian: string;
  relationship: 'mother' | 'father' | 'guardian';
  paysFees: boolean;
}

export interface SeedStudent {
  number: string;
  firstName: string;
  lastName: string;
  gender: 'F' | 'M';
  /** Prototype dates; the seed shifts them with its "today". */
  dateOfBirth: string;
  admittedOn: string;
  className: string;
  campus: 'Lekki' | 'Ikeja';
  isNewIntake: boolean;
  completedJss1Gold: boolean;
  placedForSecondTerm: boolean;
  guardians: readonly SeedGuardianLink[];
}

interface SeedGuardian {
  key: string;
  fullName: string;
  phone: string;
  address: string;
  login:
    { kind: 'email'; email: string } | { kind: 'username'; username: string };
}

export const SEED_GUARDIANS: readonly SeedGuardian[] = [
  {
    key: 'ngozi',
    fullName: 'Ngozi Okeke',
    phone: '0803 456 7890',
    address: '12 Admiralty Way, Lekki Phase 1',
    login: { kind: 'email', email: 'ngozi.okeke@greenfield.test' },
  },
  {
    key: 'ifeanyi',
    fullName: 'Ifeanyi Okeke',
    phone: '0805 678 9012',
    address: '12 Admiralty Way, Lekki Phase 1',
    login: { kind: 'username', username: 'okeke-father' },
  },
  {
    key: 'bayo',
    fullName: 'Bayo Adewale',
    phone: '0807 890 1234',
    address: '5 Fola Osibo Street, Lekki',
    login: { kind: 'email', email: 'bayo.adewale@greenfield.test' },
  },
  {
    key: 'hauwa',
    fullName: 'Hauwa Bello',
    phone: '0809 012 3456',
    address: '21 Palm Grove, Ikota',
    login: { kind: 'email', email: 'hauwa.bello@greenfield.test' },
  },
  {
    key: 'emmanuel',
    fullName: 'Emmanuel Etim',
    phone: '0810 234 5678',
    address: '8 Chevron Drive, Lekki',
    login: { kind: 'username', username: 'etim-family' },
  },
  {
    key: 'grace',
    fullName: 'Grace Johnson',
    phone: '0812 345 6789',
    address: '3 Ozumba Mbadiwe Avenue, Victoria Island',
    login: { kind: 'email', email: 'grace.johnson@greenfield.test' },
  },
];

type Draft = Pick<
  SeedStudent,
  | 'number'
  | 'firstName'
  | 'lastName'
  | 'gender'
  | 'dateOfBirth'
  | 'admittedOn'
  | 'className'
> &
  Partial<
    Pick<
      SeedStudent,
      'isNewIntake' | 'completedJss1Gold' | 'placedForSecondTerm' | 'guardians'
    >
  >;

const IKEJA_CLASSES = new Set(['JSS 2 Emerald', 'SS 1 Arts']);

const student = (draft: Draft): SeedStudent => ({
  isNewIntake: false,
  completedJss1Gold: false,
  placedForSecondTerm: false,
  guardians: [],
  ...draft,
  campus: IKEJA_CLASSES.has(draft.className) ? 'Ikeja' : 'Lekki',
});

const link = (
  guardian: string,
  relationship: SeedGuardianLink['relationship'],
  paysFees: boolean
): SeedGuardianLink => ({ guardian, relationship, paysFees });

export const students: SeedStudent[] = [
  student({
    number: '0123',
    firstName: 'Ada',
    lastName: 'Okeke',
    gender: 'F',
    dateOfBirth: '2014-03-03',
    admittedOn: '2025-09-08',
    className: 'JSS 2 Gold',
    completedJss1Gold: true,
    placedForSecondTerm: true,
    guardians: [
      link('ngozi', 'mother', true),
      link('ifeanyi', 'father', false),
    ],
  }),
  student({
    number: '0124',
    firstName: 'Tobi',
    lastName: 'Adewale',
    gender: 'M',
    dateOfBirth: '2014-06-19',
    admittedOn: '2025-09-08',
    className: 'JSS 2 Gold',
    completedJss1Gold: true,
    placedForSecondTerm: true,
    guardians: [link('bayo', 'father', true)],
  }),
  student({
    number: '0131',
    firstName: 'Zainab',
    lastName: 'Bello',
    gender: 'F',
    dateOfBirth: '2014-01-27',
    admittedOn: '2025-09-08',
    className: 'JSS 2 Gold',
    completedJss1Gold: true,
    placedForSecondTerm: true,
    guardians: [link('hauwa', 'mother', true)],
  }),
  student({
    number: '0140',
    firstName: 'Ifeoma',
    lastName: 'Nnaji',
    gender: 'F',
    dateOfBirth: '2014-09-02',
    admittedOn: '2025-09-08',
    className: 'JSS 2 Gold',
    completedJss1Gold: true,
    placedForSecondTerm: true,
  }),
  student({
    number: '0152',
    firstName: 'David',
    lastName: 'Ojo',
    gender: 'M',
    dateOfBirth: '2013-11-12',
    admittedOn: '2025-09-08',
    className: 'JSS 2 Gold',
    completedJss1Gold: true,
    placedForSecondTerm: true,
  }),
  student({
    number: '0158',
    firstName: 'Halima',
    lastName: 'Sule',
    gender: 'F',
    dateOfBirth: '2014-04-21',
    admittedOn: '2025-09-08',
    className: 'JSS 2 Gold',
    completedJss1Gold: true,
    placedForSecondTerm: true,
  }),
  student({
    number: '0163',
    firstName: 'Samuel',
    lastName: 'Etim',
    gender: 'M',
    dateOfBirth: '2013-08-30',
    admittedOn: '2024-09-09',
    className: 'JSS 2 Silver',
    guardians: [link('emmanuel', 'father', true)],
  }),
  student({
    number: '0170',
    firstName: 'Ruth',
    lastName: 'Danjuma',
    gender: 'F',
    dateOfBirth: '2014-02-14',
    admittedOn: '2024-09-09',
    className: 'JSS 2 Silver',
  }),
  student({
    number: '0175',
    firstName: 'Uche',
    lastName: 'Mba',
    gender: 'M',
    dateOfBirth: '2014-05-05',
    admittedOn: '2025-09-08',
    className: 'JSS 2 Gold',
    completedJss1Gold: true,
    placedForSecondTerm: true,
  }),
  student({
    number: '0177',
    firstName: 'Fatima',
    lastName: 'Yusuf',
    gender: 'F',
    dateOfBirth: '2014-07-16',
    admittedOn: '2025-09-08',
    className: 'JSS 2 Gold',
    completedJss1Gold: true,
    placedForSecondTerm: true,
  }),
  student({
    number: '0129',
    firstName: 'Musa',
    lastName: 'Garba',
    gender: 'M',
    dateOfBirth: '2013-12-09',
    admittedOn: '2024-09-09',
    className: 'JSS 2 Silver',
  }),
  student({
    number: '0244',
    firstName: 'Peace',
    lastName: 'Akpan',
    gender: 'F',
    dateOfBirth: '2014-10-01',
    admittedOn: '2026-09-07',
    className: 'JSS 2 Silver',
    isNewIntake: true,
  }),
  student({
    number: '0201',
    firstName: 'Femi',
    lastName: 'Lawal',
    gender: 'M',
    dateOfBirth: '2013-10-23',
    admittedOn: '2024-09-09',
    className: 'JSS 2 Emerald',
    placedForSecondTerm: true,
  }),
  student({
    number: '0207',
    firstName: 'Kunle',
    lastName: 'Ogun',
    gender: 'M',
    dateOfBirth: '2013-07-07',
    admittedOn: '2024-09-09',
    className: 'JSS 2 Emerald',
    placedForSecondTerm: true,
  }),
  student({
    number: '0310',
    firstName: 'Chidi',
    lastName: 'Okeke',
    gender: 'M',
    dateOfBirth: '2016-05-25',
    admittedOn: '2023-09-11',
    className: 'Primary 4 Blue',
    guardians: [link('ngozi', 'mother', true)],
  }),
  student({
    number: '0098',
    firstName: 'Kelechi',
    lastName: 'Okeke',
    gender: 'F',
    dateOfBirth: '2016-11-18',
    admittedOn: '2023-09-11',
    className: 'Primary 4 Blue',
    guardians: [link('ngozi', 'mother', true)],
  }),
  student({
    number: '0215',
    firstName: 'Aisha',
    lastName: 'Mohammed',
    gender: 'F',
    dateOfBirth: '2011-03-28',
    admittedOn: '2022-09-12',
    className: 'SS 1 Arts',
  }),
  student({
    number: '0090',
    firstName: 'Daniel',
    lastName: 'Eke',
    gender: 'M',
    dateOfBirth: '2011-08-04',
    admittedOn: '2022-09-12',
    className: 'SS 1 Science',
  }),
  student({
    number: '0087',
    firstName: 'Bola',
    lastName: 'Johnson',
    gender: 'M',
    dateOfBirth: '2012-02-09',
    admittedOn: '2022-09-12',
    className: 'JSS 3 Gold',
    guardians: [link('grace', 'mother', true)],
  }),
  student({
    number: '0219',
    firstName: 'Tayo',
    lastName: 'Bankole',
    gender: 'M',
    dateOfBirth: '2011-06-22',
    admittedOn: '2022-09-12',
    className: 'SS 1 Arts',
  }),
  student({
    number: '0251',
    firstName: 'Amara',
    lastName: 'Nwachukwu',
    gender: 'F',
    dateOfBirth: '2015-04-12',
    admittedOn: '2026-09-07',
    className: 'JSS 1 Gold',
    isNewIntake: true,
  }),
  student({
    number: '0253',
    firstName: 'Kayode',
    lastName: 'Martins',
    gender: 'M',
    dateOfBirth: '2013-09-15',
    admittedOn: '2026-09-07',
    className: 'JSS 2 Emerald',
    isNewIntake: true,
  }),
  student({
    number: '0061',
    firstName: 'Efe',
    lastName: 'Omoregie',
    gender: 'M',
    dateOfBirth: '2008-12-01',
    admittedOn: '2020-09-14',
    className: 'SS 3 Gold',
  }),
  student({
    number: '0064',
    firstName: 'Sade',
    lastName: 'Coker',
    gender: 'F',
    dateOfBirth: '2009-01-19',
    admittedOn: '2020-09-14',
    className: 'SS 3 Gold',
  }),
  student({
    number: '0068',
    firstName: 'Yinka',
    lastName: 'Oladipo',
    gender: 'F',
    dateOfBirth: '2008-10-30',
    admittedOn: '2020-09-14',
    className: 'SS 3 Gold',
  }),
  student({
    number: '0031',
    firstName: 'Tolu',
    lastName: 'Adebisi',
    gender: 'F',
    dateOfBirth: '2008-05-17',
    admittedOn: '2019-09-09',
    className: 'SS 3 Gold',
  }),
  student({
    number: '0034',
    firstName: 'Ibrahim',
    lastName: 'Lawan',
    gender: 'M',
    dateOfBirth: '2008-08-26',
    admittedOn: '2019-09-09',
    className: 'SS 3 Gold',
  }),
  student({
    number: '0039',
    firstName: 'Ese',
    lastName: 'Ighodaro',
    gender: 'F',
    dateOfBirth: '2009-03-11',
    admittedOn: '2019-09-09',
    className: 'SS 3 Gold',
  }),
];

export const SEED_ENROLMENTS =
  students.length + students.filter((s) => s.completedJss1Gold).length;

const TERMS_PER_YEAR = 3;

export const SEED_PLACEMENTS =
  students.length +
  students.filter((s) => s.completedJss1Gold).length * TERMS_PER_YEAR +
  students.filter((s) => s.placedForSecondTerm).length;
