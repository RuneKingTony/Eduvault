export {
  DEV_BOOTSTRAP_EMAIL as SUPER_ADMIN_EMAIL,
  DEV_BOOTSTRAP_PASSWORD as SEED_PASSWORD,
} from '../../src/app/common/auth/bootstrap-admin';

export const FORCED_CHANGE_PERSONA = 'kemi';

interface Persona {
  key: string;
  name: string;
  email: string;
}

export const personas: Persona[] = [
  { key: 'funmi', name: 'Funmi Adeyemi', email: 'funmi@greenfield.test' },
  {
    key: 'tunde',
    name: 'Tunde Bakare',
    email: 'tunde.bakare@greenfield.test',
  },
  { key: 'grace', name: 'Grace Nwosu', email: 'grace.nwosu@greenfield.test' },
  { key: 'chika', name: 'Chika Eze', email: 'chika.eze@greenfield.test' },
  { key: 'yemi', name: 'Yemi Alade', email: 'yemi.alade@greenfield.test' },
  { key: 'emeka', name: 'Emeka Obi', email: 'emeka.obi@greenfield.test' },
  { key: 'ayo', name: 'Ayo Bassey', email: 'ayo.bassey@greenfield.test' },
  { key: 'uche', name: 'Uche Nweke', email: 'uche.nweke@greenfield.test' },
  { key: 'claire', name: 'Claire Ade', email: 'claire.ade@greenfield.test' },
  { key: 'mo', name: 'Mo Multi', email: 'multi@eduvault.test' },
  { key: 'kemi', name: 'Kemi Balogun', email: 'kemi.balogun@greenfield.test' },
  { key: 'kola', name: 'Kola Ajayi', email: 'kola@hilltop.test' },
  {
    key: 'mary',
    name: 'Sr. Mary Okon',
    email: 'principal@stbrendans.test',
  },
];

interface Membership {
  persona: string;
  school: string;
  roles: string[];
  campuses: string[];
}

export const emailOf = (key: string): string => {
  const persona = personas.find((p) => p.key === key);
  if (!persona) {
    throw new Error(`Unknown persona ${key}`);
  }
  return persona.email;
};

const BOTH = ['Lekki', 'Ikeja'];

// Owners are not listed: creating the school makes them owner, and creating
// its campuses enrols them.
export const memberships: Membership[] = [
  {
    persona: 'tunde',
    school: 'greenfield',
    roles: ['administrator'],
    campuses: BOTH,
  },
  {
    persona: 'grace',
    school: 'greenfield',
    roles: ['teacher', 'principal'],
    campuses: BOTH,
  },
  {
    persona: 'chika',
    school: 'greenfield',
    roles: ['bursar'],
    campuses: ['Lekki'],
  },
  {
    persona: 'yemi',
    school: 'greenfield',
    roles: ['bursar'],
    campuses: ['Ikeja'],
  },
  {
    persona: 'emeka',
    school: 'greenfield',
    roles: ['teacher'],
    campuses: ['Lekki'],
  },
  {
    persona: 'ayo',
    school: 'greenfield',
    roles: ['teacher'],
    campuses: ['Lekki'],
  },
  {
    persona: 'uche',
    school: 'greenfield',
    roles: ['teacher'],
    campuses: ['Lekki'],
  },
  {
    persona: 'claire',
    school: 'greenfield',
    roles: ['teacher'],
    campuses: BOTH,
  },
  {
    persona: 'mo',
    school: 'greenfield',
    roles: ['teacher'],
    campuses: ['Lekki'],
  },
  {
    persona: 'mo',
    school: 'hilltop',
    roles: ['administrator'],
    campuses: ['Main'],
  },
  {
    persona: 'kemi',
    school: 'greenfield',
    roles: ['member'],
    campuses: ['Lekki'],
  },
];
