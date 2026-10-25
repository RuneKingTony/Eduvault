export const FEMALE_NAMES: readonly string[] = [
  'Adaeze',
  'Amara',
  'Ayomide',
  'Bimpe',
  'Blessing',
  'Chiamaka',
  'Chioma',
  'Damilola',
  'Efe',
  'Folake',
  'Funmilayo',
  'Hadiza',
  'Ifeoma',
  'Jumoke',
  'Kehinde',
  'Lola',
  'Mariam',
  'Naomi',
  'Ngozi',
  'Nneka',
  'Oluwaseun',
  'Omolara',
  'Oyin',
  'Precious',
  'Ronke',
  'Sade',
  'Temitope',
  'Titilayo',
  'Uche',
  'Zainab',
];

export const MALE_NAMES: readonly string[] = [
  'Abiodun',
  'Adebayo',
  'Ahmed',
  'Babatunde',
  'Chidi',
  'Chinedu',
  'David',
  'Emeka',
  'Femi',
  'Gbenga',
  'Ibrahim',
  'Ifeanyi',
  'Jide',
  'Kayode',
  'Kelechi',
  'Kunle',
  'Musa',
  'Obinna',
  'Olumide',
  'Oluwatobi',
  'Samuel',
  'Segun',
  'Tunde',
  'Uchenna',
  'Yusuf',
  'Zubair',
  'Tobiloba',
  'Ikenna',
  'Damola',
  'Seyi',
];

export const SURNAMES: readonly string[] = [
  'Abubakar',
  'Adeleke',
  'Adeyemi',
  'Afolabi',
  'Ajayi',
  'Akinola',
  'Alabi',
  'Balogun',
  'Bello',
  'Chukwu',
  'Danjuma',
  'Eze',
  'Fashola',
  'Ibekwe',
  'Idowu',
  'Johnson',
  'Lawal',
  'Mohammed',
  'Nnamdi',
  'Nwosu',
  'Obi',
  'Odukoya',
  'Ogunleye',
  'Okafor',
  'Okeke',
  'Okonkwo',
  'Olawale',
  'Oyelaran',
  'Salami',
  'Williams',
];

export const STREETS: readonly string[] = [
  'Admiralty Way, Lekki Phase 1',
  'Fola Osibo Street, Lekki',
  'Oba Akran Avenue, Ikeja',
  'Allen Avenue, Ikeja',
  'Awolowo Road, Ikoyi',
  'Adeola Odeku Street, Victoria Island',
  'Herbert Macaulay Way, Yaba',
  'Ozumba Mbadiwe Avenue, Victoria Island',
  'Isaac John Street, Ikeja GRA',
  'Ligali Ayorinde Street, Victoria Island',
  'Freedom Way, Lekki Phase 1',
  'Opebi Road, Ikeja',
  'Bode Thomas Street, Surulere',
  'Adetokunbo Ademola Street, Victoria Island',
  'Mobolaji Bank Anthony Way, Ikeja',
];

export const CAMPUS_ADDRESSES = {
  Main: '21 Bourdillon Road, Ikoyi',
  Annex: '8 Lagos-Badagry Expressway, Festac Town',
} as const;

interface DemoSubject {
  code: string;
  name: string;
}

export const DEMO_SUBJECTS: readonly DemoSubject[] = [
  { code: 'MTH', name: 'Mathematics' },
  { code: 'ENG', name: 'English Language' },
  { code: 'BSC', name: 'Basic Science' },
  { code: 'SST', name: 'Social Studies' },
  { code: 'CVE', name: 'Civic Education' },
  { code: 'CMP', name: 'Computer Studies' },
  { code: 'FRE', name: 'French' },
  { code: 'PHY', name: 'Physics' },
  { code: 'CHM', name: 'Chemistry' },
  { code: 'BIO', name: 'Biology' },
  { code: 'ECO', name: 'Economics' },
  { code: 'LIT', name: 'Literature in English' },
];

type SubjectKind = 'core' | 'elective';

interface LevelSubject {
  subject: string;
  kind: SubjectKind;
}

const core = (...codes: string[]): LevelSubject[] =>
  codes.map((subject) => ({ subject, kind: 'core' }));

const elective = (...codes: string[]): LevelSubject[] =>
  codes.map((subject) => ({ subject, kind: 'elective' }));

const PRIMARY_SUBJECTS = core('MTH', 'ENG', 'BSC', 'SST', 'CVE', 'CMP');
const JSS_SUBJECTS = [...PRIMARY_SUBJECTS, ...elective('FRE')];
const SS_SUBJECTS = [
  ...core('MTH', 'ENG', 'CVE'),
  ...elective('PHY', 'CHM', 'BIO', 'ECO', 'LIT'),
];

export const levelSubjects = (levelCode: string): readonly LevelSubject[] => {
  if (levelCode.startsWith('JSS')) {
    return JSS_SUBJECTS;
  }
  return levelCode.startsWith('SS') ? SS_SUBJECTS : PRIMARY_SUBJECTS;
};

export const TEACHER_SUBJECT_ROTATION: readonly string[] = [
  'MTH',
  'ENG',
  'BSC',
  'SST',
  'CVE',
  'CMP',
  'FRE',
  'PHY',
  'CHM',
  'BIO',
  'ECO',
  'LIT',
];

export const ARM_NAME_BY_CAMPUS = { Main: 'Gold', Annex: 'Silver' } as const;
