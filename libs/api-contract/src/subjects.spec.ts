import { contract } from './contract';
import {
  SUBJECT_CODE_MESSAGE,
  SUBJECT_DUPLICATE_ON_LEVEL_MESSAGE,
  SUBJECT_REQUIRED_MESSAGE,
  assignSubjectTeacherSchema,
  createSubjectSchema,
  electiveRemoveConfirmMessage,
  electiveTakersSavedMessage,
  electiveToCoreConfirmMessage,
  levelSubjectListQuerySchema,
  levelSubjectsSavedMessage,
  replaceLevelSubjectsSchema,
  setElectiveTakersSchema,
  subjectCodeTakenMessage,
  subjectListQuerySchema,
  subjectNotElectiveMessage,
  subjectOnLevelMessage,
  updateSubjectSchema,
} from './subjects';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const otherId = '5f1d6c0a-3b7e-4f0e-9d62-8a1f3e2b7c44';
const uuidAt = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const row = (subjectId: string, kind: 'core' | 'elective' = 'core') => ({
  subjectId,
  kind,
});

const rows = (n: number) =>
  Array.from({ length: n }, (_, index) => row(uuidAt(index + 1)));

const ids = (n: number) =>
  Array.from({ length: n }, (_, index) => uuidAt(index + 1));

const create = (code: string, name = 'Geography') =>
  createSubjectSchema.safeParse({ code, name });

const firstMessage = (result: ReturnType<typeof create>) =>
  result.error?.issues[0]?.message;

describe('createSubjectSchema', () => {
  it('trims and upper-cases the code and trims the name', () => {
    expect(
      createSubjectSchema.parse({ code: ' geo ', name: '  Geography ' })
    ).toEqual({ code: 'GEO', name: 'Geography' });
  });

  it('takes one to five letters', () => {
    expect(create('A').success).toBe(true);
    expect(create('ABCDE').success).toBe(true);
    expect(create('ABCDEF').success).toBe(false);
    expect(create('AB1').success).toBe(false);
    expect(create('A-B').success).toBe(false);
    expect(create('A B').success).toBe(false);
  });

  it('words a bad code and a blank field with the screen copy', () => {
    expect(firstMessage(create('AB1'))).toBe(SUBJECT_CODE_MESSAGE);
    expect(firstMessage(create('ABCDEF'))).toBe(SUBJECT_CODE_MESSAGE);
    expect(firstMessage(create('  '))).toBe(SUBJECT_REQUIRED_MESSAGE);
    expect(create('  ').error?.issues).toHaveLength(1);
    expect(firstMessage(create('GEO', '   '))).toBe(SUBJECT_REQUIRED_MESSAGE);
  });

  it('caps the name at 80 characters', () => {
    expect(create('GEO', 'x'.repeat(80)).success).toBe(true);
    expect(create('GEO', 'x'.repeat(81)).success).toBe(false);
  });
});

describe('updateSubjectSchema', () => {
  it('has no code, so a patch cannot change it', () => {
    expect(updateSubjectSchema.parse({ code: 'XYZ', name: 'New' })).toEqual({
      name: 'New',
    });
  });

  it('takes a name, a retired flag or neither', () => {
    expect(updateSubjectSchema.parse({})).toEqual({});
    expect(updateSubjectSchema.parse({ retired: true })).toEqual({
      retired: true,
    });
    expect(updateSubjectSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(updateSubjectSchema.safeParse({ retired: 'yes' }).success).toBe(
      false
    );
  });
});

describe('subject queries', () => {
  it('defaults to page 1 with retired subjects included', () => {
    expect(subjectListQuerySchema.parse({})).toEqual({
      page: 1,
      includeRetired: true,
      pageSize: 10,
    });
    expect(
      subjectListQuerySchema.parse({ page: '2', includeRetired: 'false' })
    ).toEqual({ page: 2, includeRetired: false, pageSize: 10 });
    expect(subjectListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(
      subjectListQuerySchema.safeParse({ includeRetired: 'maybe' }).success
    ).toBe(false);
  });

  it('takes a page size from 1 to 100', () => {
    expect(subjectListQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(
      100
    );
    expect(subjectListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(
      false
    );
    expect(subjectListQuerySchema.safeParse({ pageSize: '0' }).success).toBe(
      false
    );
  });

  it('filters level subjects by an optional level id', () => {
    expect(levelSubjectListQuerySchema.parse({})).toEqual({});
    expect(
      levelSubjectListQuerySchema.safeParse({ classLevelId: id }).success
    ).toBe(true);
    expect(
      levelSubjectListQuerySchema.safeParse({ classLevelId: 'x' }).success
    ).toBe(false);
  });

  it('assigns a subject teacher by user id', () => {
    expect(assignSubjectTeacherSchema.safeParse({ userId: id }).success).toBe(
      true
    );
    expect(assignSubjectTeacherSchema.safeParse({}).success).toBe(false);
  });
});

describe('subject messages', () => {
  it('names the code and the subject', () => {
    expect(subjectCodeTakenMessage('AGR')).toBe(
      'A subject with code AGR already exists. Codes are unique per school.'
    );
    expect(subjectOnLevelMessage('French')).toBe(
      'Take French off every class level first.'
    );
  });

  it('words the level-subject and elective copy', () => {
    expect(levelSubjectsSavedMessage('JSS 2')).toBe('JSS 2 subjects saved.');
    expect(electiveRemoveConfirmMessage(12, 'French')).toBe(
      '12 students take French as an elective this session. Remove it anyway?'
    );
    expect(electiveRemoveConfirmMessage(1, 'French')).toBe(
      '1 student takes French as an elective this session. Remove it anyway?'
    );
    expect(electiveToCoreConfirmMessage(12, 'French')).toBe(
      '12 students take French as an elective this session. Making it core clears those choices. Continue?'
    );
    expect(electiveToCoreConfirmMessage(1, 'French')).toBe(
      '1 student takes French as an elective this session. Making it core clears those choices. Continue?'
    );
    expect(electiveTakersSavedMessage(3, 'French')).toBe(
      '3 students take French this session.'
    );
    expect(subjectNotElectiveMessage('Ada Obi', 'French')).toBe(
      'French is not an elective for Ada Obi’s level.'
    );
  });
});

describe('replaceLevelSubjectsSchema', () => {
  it('takes an ordered list, empty included', () => {
    expect(
      replaceLevelSubjectsSchema.parse({
        subjects: [row(id), row(otherId, 'elective')],
      }).subjects
    ).toEqual([row(id), row(otherId, 'elective')]);
    expect(replaceLevelSubjectsSchema.safeParse({ subjects: [] }).success).toBe(
      true
    );
  });

  it('refuses a repeated subject with the screen copy', () => {
    const result = replaceLevelSubjectsSchema.safeParse({
      subjects: [row(id), row(id, 'elective')],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      SUBJECT_DUPLICATE_ON_LEVEL_MESSAGE
    );
  });

  it('caps the list at 30 rows', () => {
    expect(
      replaceLevelSubjectsSchema.safeParse({ subjects: rows(30) }).success
    ).toBe(true);
    expect(
      replaceLevelSubjectsSchema.safeParse({ subjects: rows(31) }).success
    ).toBe(false);
  });

  it('refuses an unknown kind', () => {
    expect(
      replaceLevelSubjectsSchema.safeParse({
        subjects: [{ subjectId: id, kind: 'optional' }],
      }).success
    ).toBe(false);
  });
});

describe('setElectiveTakersSchema', () => {
  it('takes unique student ids', () => {
    expect(
      setElectiveTakersSchema.safeParse({
        sessionId: id,
        studentIds: [id, otherId],
      }).success
    ).toBe(true);
    expect(
      setElectiveTakersSchema.safeParse({ sessionId: id, studentIds: [] })
        .success
    ).toBe(true);
    expect(
      setElectiveTakersSchema.safeParse({
        sessionId: id,
        studentIds: [id, id],
      }).success
    ).toBe(false);
  });

  it('caps the list at 500 students', () => {
    expect(
      setElectiveTakersSchema.safeParse({ sessionId: id, studentIds: ids(500) })
        .success
    ).toBe(true);
    expect(
      setElectiveTakersSchema.safeParse({ sessionId: id, studentIds: ids(501) })
        .success
    ).toBe(false);
  });
});

describe('subject routes', () => {
  it('has no subject delete', () => {
    expect(Object.keys(contract.subjects)).toEqual([
      'list',
      'create',
      'update',
    ]);
    expect(Object.keys(contract.levelSubjects)).toEqual(['list', 'replace']);
    expect(Object.keys(contract.electives)).toEqual(['list', 'set']);
    expect(Object.keys(contract.subjectTeachers)).toEqual([
      'list',
      'assign',
      'remove',
      'copyFromPreviousTerm',
    ]);
  });

  it('replaces a level list and sets elective takers by PUT', () => {
    expect(contract.levelSubjects.replace).toMatchObject({
      method: 'PUT',
      path: '/class-levels/:id/subjects',
    });
    expect(contract.electives.set).toMatchObject({
      method: 'PUT',
      path: '/electives/:subjectId',
    });
  });

  it('addresses subject teachers through the class', () => {
    expect(contract.subjectTeachers.assign).toMatchObject({
      method: 'PUT',
      path: '/classes/:id/subject-teachers/:subjectId',
    });
    expect(contract.subjectTeachers.remove).toMatchObject({
      method: 'DELETE',
      path: '/classes/:id/subject-teachers/:subjectId',
    });
  });
});
