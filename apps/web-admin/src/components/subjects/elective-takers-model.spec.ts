import type { ElectiveStudent } from '@eduvault/api-contract';
import { groupStudents, matchesSearch } from './elective-takers-model';

const student = ({
  classLevelId = 'jss1',
  className,
  ...rest
}: {
  id: string;
  name: string;
  admissionNumber: string;
  className: string | null;
  classLevelId?: string;
}): ElectiveStudent => ({
  ...rest,
  classId: className === null ? null : `arm-${className}`,
  className,
  classLevelId,
});

const students = [
  student({
    id: '1',
    name: 'Ada Obi',
    admissionNumber: 'GF-0123',
    className: 'JSS 1 Gold',
  }),
  student({
    id: '2',
    name: 'Bola Ade',
    admissionNumber: 'GF-0124',
    className: 'JSS 1 Emerald',
  }),
  student({
    id: '3',
    name: 'Chi Ude',
    admissionNumber: 'GF-0125',
    className: null,
  }),
  student({
    id: '4',
    name: 'Dayo Ola',
    admissionNumber: 'GF-0126',
    className: 'JSS 2 Blue',
    classLevelId: 'jss2',
  }),
];

describe('elective takers model', () => {
  it('matches a name or an admission number, ignoring case and spaces', () => {
    const ada = students[0]!;
    expect(matchesSearch(ada, '  ada ')).toBe(true);
    expect(matchesSearch(ada, 'gf-0123')).toBe(true);
    expect(matchesSearch(ada, 'obi')).toBe(true);
    expect(matchesSearch(ada, 'GF-0124')).toBe(false);
    expect(matchesSearch(ada, '')).toBe(true);
  });

  it('groups the students at elective levels by class, with no class last', () => {
    const groups = groupStudents(students, new Set(['jss1']), '');
    expect(groups.map((group) => group.label)).toEqual([
      'JSS 1 Emerald',
      'JSS 1 Gold',
      'No class',
    ]);
    expect(groups.flatMap((group) => group.students.map((s) => s.id))).toEqual([
      '2',
      '1',
      '3',
    ]);
  });

  it('narrows the groups by the search and drops the empty ones', () => {
    const groups = groupStudents(
      students,
      new Set(['jss1', 'jss2']),
      'GF-0126'
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.students[0]?.name).toBe('Dayo Ola');
  });
});
