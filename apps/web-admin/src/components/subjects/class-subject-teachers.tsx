import { useQuery } from '@tanstack/react-query';
import { useCan } from '@eduvault/auth-client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { subjectTeachersQueryOptions } from '../../queries';

function SubjectTeacherTable({ classId }: { classId: string }) {
  const teachers = useQuery(subjectTeachersQueryOptions(useApi()));
  const arm = teachers.data?.arms.find((row) => row.classId === classId);
  if (arm === undefined || arm.subjects.length === 0) {
    return null;
  }
  return (
    <>
      <p className="text-xs text-muted-foreground">Subject teachers</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Teacher</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {arm.subjects.map((row) => (
            <TableRow key={row.subjectId}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>{row.teacher?.name ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

export function ClassSubjectTeachers({ classId }: { classId: string }) {
  return useCan('subject', 'read') ? (
    <SubjectTeacherTable classId={classId} />
  ) : null;
}
