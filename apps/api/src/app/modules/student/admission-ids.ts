const PAD = 4;

const padded = (value: number): string => String(value).padStart(PAD, '0');

export const formatAdmissionNumber = (prefix: string, value: number): string =>
  `${prefix}-${padded(value)}`;

export const formatStudentUsername = (slug: string, value: number): string =>
  `${slug}-${padded(value)}`;
