import { contract } from './contract';
import {
  SUBJECT_CODE_MESSAGE,
  SUBJECT_REQUIRED_MESSAGE,
  assignSubjectTeacherSchema,
  createSubjectSchema,
  levelSubjectListQuerySchema,
  subjectCodeTakenMessage,
  subjectListQuerySchema,
  subjectOnLevelMessage,
  updateSubjectSchema,
} from './subjects';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

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
    });
    expect(
      subjectListQuerySchema.parse({ page: '2', includeRetired: 'false' })
    ).toEqual({ page: 2, includeRetired: false });
    expect(subjectListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(
      subjectListQuerySchema.safeParse({ includeRetired: 'maybe' }).success
    ).toBe(false);
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
});

describe('subject routes', () => {
  it('has no subject delete', () => {
    expect(Object.keys(contract.subjects)).toEqual([
      'list',
      'create',
      'update',
    ]);
    expect(Object.keys(contract.levelSubjects)).toEqual(['list']);
    expect(Object.keys(contract.subjectTeachers)).toEqual([
      'list',
      'assign',
      'remove',
      'copyFromPreviousTerm',
    ]);
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
