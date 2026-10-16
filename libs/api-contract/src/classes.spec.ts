import {
  assignClassTeacherSchema,
  classLevelExistsMessage,
  classListQuerySchema,
  createClassLevelSchema,
  createClassSchema,
  graduateClassSchema,
  teacherCandidatesQuerySchema,
  updateClassLevelSchema,
  updateClassSchema,
} from './classes';
import { contract } from './contract';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const parseCode = (code: string) =>
  createClassLevelSchema.safeParse({ code, name: 'Creche' }).success;

const parseRole = (role: string) =>
  assignClassTeacherSchema.safeParse({ userId: id, role }).success;

describe('class level schemas', () => {
  it('takes a code of 2 to 8 capitals and digits', () => {
    const parse = parseCode;
    expect(parse('CR')).toBe(true);
    expect(parse('JSS1')).toBe(true);
    expect(parse('ABCDEFG1')).toBe(true);
    expect(parse('C')).toBe(false);
    expect(parse('ABCDEFGH1')).toBe(false);
    expect(parse('cr')).toBe(false);
    expect(parse('J-1')).toBe(false);
  });

  it('refuses a blank name and trims the rest', () => {
    expect(
      createClassLevelSchema.safeParse({ code: 'CR', name: '   ' }).success
    ).toBe(false);
    expect(
      createClassLevelSchema.parse({ code: 'CR', name: '  Creche ' }).name
    ).toBe('Creche');
    expect(updateClassLevelSchema.safeParse({ name: ' ' }).success).toBe(false);
  });

  it('accepts a null next level on a patch and a whole number position from 1', () => {
    expect(updateClassLevelSchema.parse({ nextLevelId: null })).toEqual({
      nextLevelId: null,
    });
    expect(updateClassLevelSchema.safeParse({ nextLevelId: id }).success).toBe(
      true
    );
    expect(updateClassLevelSchema.safeParse({ sequence: 1 }).success).toBe(
      true
    );
    expect(updateClassLevelSchema.safeParse({ sequence: 0 }).success).toBe(
      false
    );
    expect(updateClassLevelSchema.safeParse({ sequence: 1.5 }).success).toBe(
      false
    );
    expect(updateClassLevelSchema.parse({})).toEqual({});
  });
});

describe('class schemas', () => {
  it('refuses a blank class name with the PRD copy and trims the rest', () => {
    const result = createClassSchema.safeParse({
      levelId: id,
      campusId: id,
      name: '  ',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Give the class a name, for example Gold.'
    );
    expect(
      createClassSchema.parse({ levelId: id, campusId: id, name: ' Gold ' })
        .name
    ).toBe('Gold');
    expect(updateClassSchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateClassSchema.parse({ archived: true })).toEqual({
      archived: true,
    });
  });

  it('takes only lead, assistant or uniform as a role', () => {
    const parse = parseRole;
    expect(parse('lead')).toBe(true);
    expect(parse('assistant')).toBe(true);
    expect(parse('uniform')).toBe(true);
    expect(parse('head')).toBe(false);
  });

  it('lists active classes unless asked otherwise', () => {
    expect(classListQuerySchema.parse({})).toEqual({ status: 'active' });
    expect(classListQuerySchema.parse({ status: 'all' }).status).toBe('all');
    expect(classListQuerySchema.safeParse({ status: 'gone' }).success).toBe(
      false
    );
  });

  it('words the level code conflict with the code', () => {
    expect(classLevelExistsMessage('CR')).toBe('CR already exists.');
  });
});

describe('class routes', () => {
  it('has the graduate route and no level delete', () => {
    expect(
      Object.keys(contract.classes).toSorted((a, b) => a.localeCompare(b))
    ).toEqual([
      'assignTeacher',
      'create',
      'get',
      'graduate',
      'list',
      'removeTeacher',
      'teacherCandidates',
      'update',
    ]);
    expect(
      Object.keys(contract.classLevels).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['create', 'list', 'update']);
  });
});

describe('teacherCandidatesQuerySchema', () => {
  it('lists class candidates unless asked for subject ones', () => {
    expect(teacherCandidatesQuerySchema.parse({})).toEqual({ for: 'class' });
    expect(teacherCandidatesQuerySchema.parse({ for: 'subject' })).toEqual({
      for: 'subject',
    });
    expect(teacherCandidatesQuerySchema.safeParse({ for: 'x' }).success).toBe(
      false
    );
  });
});

describe('graduateClassSchema', () => {
  it('needs at least one student with the screen copy', () => {
    const empty = graduateClassSchema.safeParse({ studentIds: [] });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe('Tick at least one student.');
    expect(graduateClassSchema.safeParse({ studentIds: [id] }).success).toBe(
      true
    );
    expect(graduateClassSchema.safeParse({ studentIds: ['x'] }).success).toBe(
      false
    );
  });
});
