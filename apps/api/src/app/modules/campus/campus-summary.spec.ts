import type { Campus } from '@eduvault/api-contract';
import { summariseCampus } from './campus-summary';
import type { CampusMemberRecord } from './campus.repository';

const campus = (id: string, name: string): Campus => ({
  id,
  organizationId: 'school-a',
  name,
  address: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const person = (
  campusId: string,
  name: string,
  roles: string[]
): CampusMemberRecord => ({
  campusId,
  userId: `user-${name}`,
  name,
  roles: ['member', ...roles],
});

const LEKKI = campus('lekki', 'Lekki');
const IKEJA = campus('ikeja', 'Ikeja');

const members = [
  person('lekki', 'Grace', ['principal']),
  person('lekki', 'Emeka', ['teacher']),
  person('lekki', 'Ada', ['student']),
  person('lekki', 'Bayo', ['guardian']),
  person('ikeja', 'Yemi', ['bursar']),
];

describe('summariseCampus', () => {
  it('lists the members holding principal on that campus only', () => {
    expect(summariseCampus(LEKKI, members).principals).toEqual([
      { userId: 'user-Grace', name: 'Grace' },
    ]);
    expect(summariseCampus(IKEJA, members).principals).toEqual([]);
  });

  it('lists every principal when a campus has two', () => {
    const two = [...members, person('lekki', 'Femi', ['principal', 'teacher'])];

    expect(
      summariseCampus(LEKKI, two).principals.map((entry) => entry.name)
    ).toEqual(['Grace', 'Femi']);
  });

  it('counts staff without portal-only accounts', () => {
    expect(summariseCampus(LEKKI, members).counts.staff).toBe(2);
    expect(summariseCampus(IKEJA, members).counts.staff).toBe(1);
  });

  it('keeps classes and students at 0 until they exist', () => {
    expect(summariseCampus(LEKKI, members).counts).toMatchObject({
      classes: 0,
      students: 0,
    });
  });

  it('keeps the campus fields and an empty campus at zero staff', () => {
    const empty = summariseCampus(campus('ajah', 'Ajah'), members);

    expect(empty).toMatchObject({ id: 'ajah', name: 'Ajah', principals: [] });
    expect(empty.counts.staff).toBe(0);
  });
});
