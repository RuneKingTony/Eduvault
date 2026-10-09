interface SeedStudent {
  admissionNumber: string;
  fullName: string;
  campus: 'Lekki' | 'Ikeja';
}

const student = (
  adm: string,
  fullName: string,
  campus: SeedStudent['campus']
): SeedStudent => ({ admissionNumber: `GF-${adm}`, fullName, campus });

export const students: SeedStudent[] = [
  student('0123', 'Ada Okeke', 'Lekki'),
  student('0124', 'Tobi Adewale', 'Lekki'),
  student('0131', 'Zainab Bello', 'Lekki'),
  student('0140', 'Ifeoma Nnaji', 'Lekki'),
  student('0152', 'David Ojo', 'Lekki'),
  student('0158', 'Halima Sule', 'Lekki'),
  student('0163', 'Samuel Etim', 'Lekki'),
  student('0170', 'Ruth Danjuma', 'Lekki'),
  student('0175', 'Uche Mba', 'Lekki'),
  student('0177', 'Fatima Yusuf', 'Lekki'),
  student('0129', 'Musa Garba', 'Lekki'),
  student('0244', 'Peace Akpan', 'Lekki'),
  student('0201', 'Femi Lawal', 'Ikeja'),
  student('0207', 'Kunle Ogun', 'Ikeja'),
  student('0310', 'Chidi Okeke', 'Lekki'),
  student('0098', 'Kelechi Okeke', 'Lekki'),
  student('0215', 'Aisha Mohammed', 'Ikeja'),
  student('0090', 'Daniel Eke', 'Lekki'),
  student('0087', 'Bola Johnson', 'Lekki'),
  student('0219', 'Tayo Bankole', 'Ikeja'),
  student('0251', 'Amara Nwachukwu', 'Lekki'),
  student('0253', 'Kayode Martins', 'Ikeja'),
  student('0061', 'Efe Omoregie', 'Lekki'),
  student('0064', 'Sade Coker', 'Lekki'),
  student('0068', 'Yinka Oladipo', 'Lekki'),
  student('0031', 'Tolu Adebisi', 'Lekki'),
  student('0034', 'Ibrahim Lawan', 'Lekki'),
  student('0039', 'Ese Ighodaro', 'Lekki'),
];
