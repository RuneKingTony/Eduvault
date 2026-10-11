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
    expect(summariseCampus(LEKKI, members, {}).principals).toEqual([
      { userId: 'user-Grace', name: 'Grace' },
    ]);
    expect(summariseCampus(IKEJA, members, {}).principals).toEqual([]);
  });

  it('lists every principal when a campus has two', () => {
    const two = [...members, person('lekki', 'Femi', ['principal', 'teacher'])];

    expect(
      summariseCampus(LEKKI, two, {}).principals.map((entry) => entry.name)
    ).toEqual(['Grace', 'Femi']);
  });

  it('counts staff without portal-only accounts', () => {
    expect(summariseCampus(LEKKI, members, {}).counts.staff).toBe(2);
    expect(summariseCampus(IKEJA, members, {}).counts.staff).toBe(1);
  });

  it('counts the active classes of that campus and keeps students at 0', () => {
    const counts = { lekki: 7, ikeja: 3 };

    expect(summariseCampus(LEKKI, members, counts).counts).toMatchObject({
      classes: 7,
      students: 0,
    });
    expect(summariseCampus(IKEJA, members, counts).counts.classes).toBe(3);
  });

  it('shows 0 classes for a campus with none', () => {
    expect(summariseCampus(LEKKI, members, {}).counts.classes).toBe(0);
  });

  it('keeps the campus fields and an empty campus at zero staff', () => {
    const empty = summariseCampus(campus('ajah', 'Ajah'), members, {});

    expect(empty).toMatchObject({ id: 'ajah', name: 'Ajah', principals: [] });
    expect(empty.counts.staff).toBe(0);
  });
});
