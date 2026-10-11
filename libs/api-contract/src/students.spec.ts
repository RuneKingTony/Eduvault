import { contract } from './contract';
import {
  admissionDuplicatesQuerySchema,
  admitStudentSchema,
  LEAVING_REASONS,
  leavingReasonLabel,
  leaveSchema,
  markAwaySchema,
  newSchoolYearRowSchema,
  placeStudentSchema,
  startNewSchoolYearSchema,
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

  it('takes an optional term id and refuses one that is not an id', () => {
    expect(
      admitStudentSchema.safeParse(admission).data?.termId
    ).toBeUndefined();
    expect(
      admitStudentSchema.safeParse({ ...admission, termId: id }).data?.termId
    ).toBe(id);
    expect(
      admitStudentSchema.safeParse({ ...admission, termId: 'next' }).success
    ).toBe(false);
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

  it('has a reset-login route for a student, answering the shared login shape', () => {
    expect(contract.students.resetLogin.method).toBe('POST');
    expect(contract.students.resetLogin.path).toBe('/students/:id/reset-login');
  });

  it('has the lifecycle and Start new school year routes', () => {
    expect(contract.students.markAway.path).toBe('/students/:id/not-seen');
    expect(contract.students.backInSchool.path).toBe(
      '/students/:id/back-in-school'
    );
    expect(contract.students.leave.path).toBe('/students/:id/leave');
    expect(contract.students.undoLeaving.path).toBe(
      '/students/:id/undo-leaving'
    );
    expect(contract.students.place.path).toBe('/students/:id/placements');
    expect(contract.students.nextTermClasses.method).toBe('GET');
    expect(contract.students.nextTermClasses.path).toBe(
      '/students/:id/next-term-classes'
    );
    expect(contract.students.newSchoolYearPreview.method).toBe('GET');
    expect(contract.students.startNewSchoolYear.method).toBe('POST');
    expect(contract.students.startNewSchoolYear.path).toBe(
      '/students/new-school-year'
    );
  });
});

describe('markAwaySchema', () => {
  it('trims the note and keeps it optional', () => {
    expect(markAwaySchema.parse({ date: '2026-10-04' })).toEqual({
      date: '2026-10-04',
    });
    expect(
      markAwaySchema.parse({ date: '2026-10-04', note: '  no answer  ' }).note
    ).toBe('no answer');
  });

  it('refuses a note over 500 characters and a malformed date', () => {
    expect(
      markAwaySchema.safeParse({ date: '2026-10-04', note: 'x'.repeat(501) })
        .success
    ).toBe(false);
    expect(
      markAwaySchema.safeParse({ date: '2026-10-04', note: 'x'.repeat(500) })
        .success
    ).toBe(true);
    expect(markAwaySchema.safeParse({ date: 'yesterday' }).success).toBe(false);
  });
});

describe('leavingReasonLabel', () => {
  it('names a reason code by its label', () => {
    expect(leavingReasonLabel('transferred')).toBe(
      'Transferred to another school'
    );
  });

  it('falls back to Other', () => {
    expect(leavingReasonLabel('bored')).toBe('Other');
  });
});

describe('leaveSchema', () => {
  const leave = { reason: 'relocated', lastDay: '2026-10-02' };

  it('takes each of the six reason codes and nothing else', () => {
    expect(LEAVING_REASONS.map((reason) => reason.code)).toEqual([
      'did_not_return',
      'relocated',
      'transferred',
      'fees',
      'expelled',
      'other',
    ]);
    for (const { code } of LEAVING_REASONS) {
      expect(leaveSchema.safeParse({ ...leave, reason: code }).success).toBe(
        true
      );
    }
    expect(
      leaveSchema.safeParse({ ...leave, reason: 'completed' }).success
    ).toBe(false);
    expect(leaveSchema.safeParse({ ...leave, reason: 'bored' }).success).toBe(
      false
    );
  });

  it('trims and caps the note', () => {
    expect(leaveSchema.parse({ ...leave, note: ' Abuja ' }).note).toBe('Abuja');
    expect(
      leaveSchema.safeParse({ ...leave, note: 'x'.repeat(501) }).success
    ).toBe(false);
  });
});

describe('placeStudentSchema', () => {
  it('needs a term and a class', () => {
    expect(
      placeStudentSchema.safeParse({ termId: id, classArmId: id }).success
    ).toBe(true);
    expect(placeStudentSchema.safeParse({ termId: id }).success).toBe(false);
  });
});

describe('newSchoolYearRowSchema', () => {
  it('needs a class to move or repeat, not to graduate', () => {
    const missing = newSchoolYearRowSchema.safeParse({
      studentId: id,
      outcome: 'move',
    });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.message).toBe('Choose a class.');
    expect(missing.error?.issues[0]?.path).toEqual(['classArmId']);
    expect(
      newSchoolYearRowSchema.safeParse({ studentId: id, outcome: 'repeat' })
        .success
    ).toBe(false);
    expect(
      newSchoolYearRowSchema.safeParse({ studentId: id, outcome: 'graduate' })
        .success
    ).toBe(true);
    expect(
      newSchoolYearRowSchema.safeParse({
        studentId: id,
        outcome: 'repeat',
        classArmId: id,
      }).success
    ).toBe(true);
  });

  it('refuses an unknown outcome', () => {
    expect(
      newSchoolYearRowSchema.safeParse({
        studentId: id,
        outcome: 'skip',
        classArmId: id,
      }).success
    ).toBe(false);
  });
});

describe('startNewSchoolYearSchema', () => {
  it('needs the target year and at least one row', () => {
    expect(
      startNewSchoolYearSchema.safeParse({ targetYearId: id, rows: [] }).success
    ).toBe(false);
    expect(
      startNewSchoolYearSchema.safeParse({
        targetYearId: id,
        rows: [{ studentId: id, outcome: 'graduate' }],
      }).success
    ).toBe(true);
  });
});
