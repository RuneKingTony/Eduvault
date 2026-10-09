import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campus, Student } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { Button, TextField, fieldValue, ErrorMessage } from '@eduvault/ui';
import { useApi } from '../api';
import { campusesQueryOptions, studentsQueryOptions } from '../queries';

export function StudentsPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const students = useQuery(studentsQueryOptions(api));
  const campuses = useQuery(campusesQueryOptions(api));
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

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create.mutate(
      {
        fullName: fieldValue(data, 'fullName'),
        admissionNumber: fieldValue(data, 'admissionNumber'),
      },
      { onSuccess: () => form.reset() }
    );
  }

  const campusName = (id: string) =>
    campuses.data?.find((campus) => campus.id === id)?.name ?? id;

  return (
    <section className="flex flex-col gap-4">
      <h1>Students</h1>
      <ErrorMessage error={students.error ?? create.error} />
      <StudentList students={students.data} campusName={campusName} />
      <Can permission="student:create">
        <StudentForm
          campuses={campuses.data}
          campusId={campusId}
          onCampusChange={setCampusId}
          pending={create.isPending}
          onSubmit={submit}
        />
      </Can>
    </section>
  );
}

function StudentList({
  students,
  campusName,
}: {
  students: Student[] | undefined;
  campusName: (id: string) => string;
}) {
  return (
    <ul className="divide-y rounded-md border">
      {students?.map((student) => (
        <li key={student.id} className="flex items-center justify-between p-3">
          <span>
            {student.fullName}{' '}
            <span className="text-sm text-muted-foreground">
              {student.admissionNumber} · {campusName(student.campusId)}
            </span>
          </span>
        </li>
      ))}
      {students?.length === 0 ? (
        <li className="p-3 text-muted-foreground">No students yet.</li>
      ) : null}
    </ul>
  );
}

function StudentForm({
  campuses,
  campusId,
  onCampusChange,
  pending,
  onSubmit,
}: {
  campuses: Campus[] | undefined;
  campusId: string;
  onCampusChange: (id: string) => void;
  pending: boolean;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <TextField label="Full name" name="fullName" required />
      <TextField label="Admission number" name="admissionNumber" required />
      <div className="flex flex-col gap-1">
        <label
          htmlFor="student-campus"
          className="text-sm font-medium text-foreground"
        >
          Campus
        </label>
        <select
          id="student-campus"
          className="rounded-md border border-input px-3 py-2 text-sm"
          value={campusId}
          onChange={(event) => onCampusChange(event.target.value)}
        >
          <option value="">Active campus</option>
          {campuses?.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        Add student
      </Button>
    </form>
  );
}
