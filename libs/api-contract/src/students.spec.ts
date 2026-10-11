import { contract } from './contract';
import {
  admissionDuplicatesQuerySchema,
  admitStudentSchema,
  studentCountsSchema,
  studentListQuerySchema,
  studentListSchema,
  updateStudentSchema,
} from './students';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const admission = {
  firstName: ' Peace ',
  lastName: ' Udoh ',
  gender: 'F',
  dateOfBirth: '2014-03-03',
  classArmId: id,
};

describe('studentListQuerySchema', () => {
  it('defaults to the active tab, page 1 and 10 rows', () => {
    expect(studentListQuerySchema.parse({})).toEqual({
      tab: 'active',
      page: 1,
      pageSize: 10,
    });
  });

  it('caps the page size at 100 and refuses zero', () => {
    expect(studentListQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(
      100
    );
    expect(studentListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(
      false
    );
    expect(studentListQuerySchema.safeParse({ pageSize: '0' }).success).toBe(
      false
    );
    expect(studentListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('takes the five tabs and a trimmed search', () => {
    for (const tab of ['active', 'new', 'inactive', 'left', 'graduated']) {
      expect(studentListQuerySchema.safeParse({ tab }).success).toBe(true);
    }
    expect(studentListQuerySchema.safeParse({ tab: 'archived' }).success).toBe(
      false
    );
    expect(studentListQuerySchema.parse({ q: '  ada ' }).q).toBe('ada');
  });
});

describe('studentListSchema', () => {
  it('holds a count for every tab', () => {
    expect(
      studentCountsSchema.safeParse({
        active: 1,
        new: 0,
        inactive: 0,
        left: 0,
        graduated: 0,
      }).success
    ).toBe(true);
    expect(
      studentListSchema.parse({
        items: [],
        total: 0,
        counts: { active: 0, new: 0, inactive: 0, left: 0, graduated: 0 },
        startYear: null,
      }).startYear
    ).toBeNull();
  });
});

describe('admitStudentSchema', () => {
  it('trims the names and defaults to no guardians', () => {
    const parsed = admitStudentSchema.parse(admission);
    expect(parsed.firstName).toBe('Peace');
    expect(parsed.lastName).toBe('Udoh');
    expect(parsed.guardians).toEqual([]);
  });

  it('refuses a blank name with the screen copy and a bad gender', () => {
    expect(
      admitStudentSchema.safeParse({ ...admission, firstName: ' ' }).error
        ?.issues[0]?.message
    ).toBe('Enter the first name.');
    expect(
      admitStudentSchema.safeParse({ ...admission, lastName: '' }).error
        ?.issues[0]?.message
    ).toBe('Enter the last name.');
    expect(
      admitStudentSchema.safeParse({ ...admission, gender: 'X' }).success
    ).toBe(false);
  });

  it('wants a real date of birth', () => {
    expect(
      admitStudentSchema.safeParse({ ...admission, dateOfBirth: '2014-02-30' })
        .success
    ).toBe(false);
    expect(
      admitStudentSchema.safeParse({ ...admission, dateOfBirth: '3 Mar 2014' })
        .error?.issues[0]?.message
    ).toBe('Choose a date of birth on or before today.');
  });

  it('takes guardians as existing or new and no more than six', () => {
    const existing = { existingGuardianId: id, relationship: 'father' };
    expect(
      admitStudentSchema.safeParse({
        ...admission,
        guardians: Array.from({ length: 6 }, () => existing),
      }).success
    ).toBe(true);
    expect(
      admitStudentSchema.safeParse({
        ...admission,
        guardians: Array.from({ length: 7 }, () => existing),
      }).success
    ).toBe(false);
  });
});

describe('other student schemas', () => {
  it('refuses campus and admission number edits on a patch', () => {
    expect(updateStudentSchema.safeParse({ firstName: 'Ada' }).success).toBe(
      true
    );
    expect(
      updateStudentSchema.safeParse({ admissionNumber: 'X' }).success
    ).toBe(false);
    expect(updateStudentSchema.safeParse({ campusId: id }).success).toBe(false);
  });

  it('needs all three duplicate fields', () => {
    expect(
      admissionDuplicatesQuerySchema.safeParse({
        firstName: 'Ada',
        lastName: 'Okeke',
      }).success
    ).toBe(false);
    expect(
      admissionDuplicatesQuerySchema.safeParse({
        firstName: 'Ada',
        lastName: 'Okeke',
        dateOfBirth: '2014-03-03',
      }).success
    ).toBe(true);
  });

  it('has no delete route for students', () => {
    expect(Object.keys(contract.students)).not.toContain('remove');
    expect(Object.keys(contract.guardians)).toHaveLength(4);
  });
});
