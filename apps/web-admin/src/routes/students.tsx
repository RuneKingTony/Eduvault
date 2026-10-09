import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { StudentsPage } from '../pages/students-page';
import { campusesQueryOptions, studentsQueryOptions } from '../queries';

export const Route = createFileRoute('/students')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/students');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await Promise.all([
      queryClient.query({ ...studentsQueryOptions(api), staleTime: 'static' }),
      queryClient.query({ ...campusesQueryOptions(api), staleTime: 'static' }),
    ]);
  },
  component: StudentsPage,
});
