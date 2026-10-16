export interface SendableCharge {
  id: string;
  lastName: string;
  firstName: string;
  admissionNumber: string;
}

const collator = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true,
});

const compare = (a: string, b: string): number => collator.compare(a, b);

export function sendOrder<T extends SendableCharge>(
  charges: readonly T[]
): T[] {
  return charges.toSorted(
    (a, b) =>
      compare(a.lastName, b.lastName) ||
      compare(a.firstName, b.firstName) ||
      compare(a.admissionNumber, b.admissionNumber) ||
      a.id.localeCompare(b.id)
  );
}
