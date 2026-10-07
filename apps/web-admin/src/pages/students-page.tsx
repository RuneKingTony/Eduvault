import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, TextField } from '@eduvault/ui';
import { useApi } from '../api';
import { ErrorMessage } from '../components/error-message';

export function StudentsPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const students = useQuery({
    queryKey: ['students'],
    queryFn: () => api.students.list({ query: {} }),
  });
  const campuses = useQuery({
    queryKey: ['campuses'],
    queryFn: () => api.campuses.list({}),
  });
  const [campusId, setCampusId] = useState('');

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['students'] });
  const create = useMutation({
    mutationFn: (input: { fullName: string; admissionNumber: string }) =>
      api.students.create({
        body: { ...input, ...(campusId ? { campusId } : {}) },
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.students.remove({ params: { id } }),
    onSuccess: refresh,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create.mutate(
      {
        fullName: String(data.get('fullName') ?? ''),
        admissionNumber: String(data.get('admissionNumber') ?? ''),
      },
      { onSuccess: () => form.reset() }
    );
  }

  const campusName = (id: string) =>
    campuses.data?.find((campus) => campus.id === id)?.name ?? id;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Students</h2>
      <ErrorMessage error={students.error ?? create.error ?? remove.error} />
      <ul className="divide-y rounded-md border">
        {students.data?.map((student) => (
          <li
            key={student.id}
            className="flex items-center justify-between p-3"
          >
            <span>
              {student.fullName}{' '}
              <span className="text-sm text-slate-500">
                {student.admissionNumber} · {campusName(student.campusId)}
              </span>
            </span>
            <button
              className="text-sm text-red-600"
              onClick={() => remove.mutate(student.id)}
            >
              Remove
            </button>
          </li>
        ))}
        {students.data?.length === 0 ? (
          <li className="p-3 text-slate-500">No students yet.</li>
        ) : null}
      </ul>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <TextField label="Full name" name="fullName" required />
        <TextField label="Admission number" name="admissionNumber" required />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="student-campus"
            className="text-sm font-medium text-slate-700"
          >
            Campus
          </label>
          <select
            id="student-campus"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={campusId}
            onChange={(event) => setCampusId(event.target.value)}
          >
            <option value="">Active campus</option>
            {campuses.data?.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={create.isPending}>
          Add student
        </Button>
      </form>
    </section>
  );
}
