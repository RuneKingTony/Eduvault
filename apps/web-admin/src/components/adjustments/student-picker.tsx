import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { StudentRow } from '@eduvault/api-contract';
import { NativeSelectOption, SelectField, TextField } from '@eduvault/ui';
import { useApi } from '../../api';
import {
  requestStudentsQueryOptions,
  studentQueryOptions,
} from '../../queries';

const SEARCH_DELAY_MS = 250;

function useDebounced(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [value]);
  return settled;
}

const labelOf = (student: StudentRow) =>
  `${student.firstName} ${student.lastName} · ${student.admissionNumber}`;

export function StudentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (studentId: string) => void;
}) {
  const api = useApi();
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const found = useQuery(requestStudentsQueryOptions(api, q));
  const chosen = useQuery({
    ...studentQueryOptions(api, value),
    enabled: value !== '',
  });
  const options = found.data?.items ?? [];
  const extra =
    chosen.data !== undefined && !options.some((row) => row.id === value)
      ? chosen.data
      : undefined;
  return (
    <>
      <TextField
        label="Find a student"
        name="student-search"
        type="search"
        placeholder="Name or admission number"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
          }
        }}
      />
      <SelectField
        label="Student"
        name="student"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <NativeSelectOption value="">Choose a student</NativeSelectOption>
        {extra === undefined ? null : (
          <NativeSelectOption value={extra.id}>
            {labelOf(extra)}
          </NativeSelectOption>
        )}
        {options.map((student) => (
          <NativeSelectOption key={student.id} value={student.id}>
            {labelOf(student)}
          </NativeSelectOption>
        ))}
      </SelectField>
    </>
  );
}
