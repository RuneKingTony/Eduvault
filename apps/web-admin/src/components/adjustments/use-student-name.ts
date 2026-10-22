import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../api';
import { studentQueryOptions } from '../../queries';

export function useStudentName(studentId: string): string {
  const student = useQuery({
    ...studentQueryOptions(useApi(), studentId),
    enabled: studentId !== '',
  });
  return student.data === undefined
    ? ''
    : `${student.data.firstName} ${student.data.lastName}`;
}
