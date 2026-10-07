import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api';
import { ErrorMessage } from '../components/error-message';

export function StudentsPage() {
  const api = useApi();
  const students = useQuery({
    queryKey: ['students'],
    queryFn: () => api.students.list({ query: {} }),
  });
  const campuses = useQuery({
    queryKey: ['campuses'],
    queryFn: () => api.campuses.list({}),
  });

  const campusName = (id: string) =>
    campuses.data?.find((campus) => campus.id === id)?.name ?? id;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Students</h2>
      <ErrorMessage error={students.error} />
      <ul className="divide-y rounded-md border">
        {students.data?.map((student) => (
          <li key={student.id} className="p-3">
            {student.fullName}{' '}
            <span className="text-sm text-slate-500">
              {student.admissionNumber} · {campusName(student.campusId)}
            </span>
          </li>
        ))}
        {students.data?.length === 0 ? (
          <li className="p-3 text-slate-500">No students on your campuses.</li>
        ) : null}
      </ul>
    </section>
  );
}
