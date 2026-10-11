interface DuplicateFacts {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

const norm = (value: string): string => value.trim().toLowerCase();

export const isPossibleDuplicate = (
  a: DuplicateFacts,
  b: DuplicateFacts
): boolean =>
  norm(a.firstName) === norm(b.firstName) &&
  norm(a.lastName) === norm(b.lastName) &&
  a.dateOfBirth === b.dateOfBirth;
