import { contract } from './contract';
import {
  isNewAnnouncement,
  newAnnouncementsSince,
  portalAnnouncementsQuerySchema,
  portalChildSchema,
  portalMeSchema,
  portalStudentParamsSchema,
  portalStudentSchema,
} from './portal';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const child = {
  id,
  firstName: 'Ada',
  lastName: 'Okeke',
  className: null,
  campusName: 'Lekki',
  archived: false,
};

describe('portal schemas', () => {
  it('accepts a child without a class', () => {
    expect(portalChildSchema.parse(child)).toEqual(child);
  });

  it('accepts a guardian login with no email and a student login with no email', () => {
    const me = {
      kind: 'guardian',
      name: 'Ngozi Okeke',
      firstName: 'Ngozi',
      login: { username: 'ngozi.okeke', email: null },
      school: { name: 'Greenfield', admissionPrefix: 'GF', logoUrl: null },
      children: [child],
    };
    expect(portalMeSchema.parse(me)).toEqual(me);
    expect(portalMeSchema.safeParse({ ...me, kind: 'staff' }).success).toBe(
      false
    );
  });

  it('describes a student with a class teacher or none', () => {
    const student = {
      id,
      firstName: 'Ada',
      lastName: 'Okeke',
      admissionNumber: 'GF-0123',
      dateOfBirth: '2014-05-02',
      className: 'JSS 1 A',
      campusName: 'Lekki',
      classTeacherName: null,
      username: 'greenfield-0123',
      archived: false,
    };
    expect(portalStudentSchema.parse(student)).toEqual(student);
  });

  it('wants a student id in the path', () => {
    expect(portalStudentParamsSchema.safeParse({ studentId: id }).success).toBe(
      true
    );
    expect(
      portalStudentParamsSchema.safeParse({ studentId: 'nope' }).success
    ).toBe(false);
  });

  it('defaults the announcement limit to five and caps it at five', () => {
    expect(portalAnnouncementsQuerySchema.parse({}).limit).toBe(5);
    expect(portalAnnouncementsQuerySchema.parse({ limit: '3' }).limit).toBe(3);
    expect(
      portalAnnouncementsQuerySchema.safeParse({ limit: '6' }).success
    ).toBe(false);
    expect(
      portalAnnouncementsQuerySchema.safeParse({ limit: '0' }).success
    ).toBe(false);
  });
});

describe('the new-this-week window', () => {
  it('starts seven days before today', () => {
    expect(newAnnouncementsSince('2026-10-11')).toBe('2026-10-04');
    expect(newAnnouncementsSince('2026-03-03')).toBe('2026-02-24');
    expect(newAnnouncementsSince('2027-01-03')).toBe('2026-12-27');
  });

  it('counts day seven as new and day eight as old', () => {
    expect(isNewAnnouncement('2026-10-04', '2026-10-11')).toBe(true);
    expect(isNewAnnouncement('2026-10-03', '2026-10-11')).toBe(false);
    expect(isNewAnnouncement('2026-10-11', '2026-10-11')).toBe(true);
  });
});

describe('the portal routes', () => {
  it('are all reads', () => {
    for (const route of Object.values(contract.portal)) {
      expect(route.method).toBe('GET');
    }
    expect(
      Object.keys(contract.portal).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['announcements', 'children', 'me', 'student']);
  });
});
