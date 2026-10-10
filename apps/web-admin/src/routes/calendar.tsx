import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { parseCalendarSearch } from '../calendar-search';
import { SettingsLayout } from '../components/settings-nav';
import { CalendarPage } from '../pages/calendar-page';
import { currentTermQueryOptions, schoolYearsQueryOptions } from '../queries';

export const Route = createFileRoute('/calendar')({
  validateSearch: parseCalendarSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/calendar');
  },
  loaderDeps: ({ search: { page } }) => ({ page: page ?? 1 }),
  loader: async ({ context: { queryClient, api }, deps }) => {
    await Promise.all([
      queryClient.query({
        ...schoolYearsQueryOptions(api, deps.page),
        staleTime: 'static',
      }),
      queryClient.query({
        ...schoolYearsQueryOptions(api, 1),
        staleTime: 'static',
      }),
      queryClient.query({
        ...currentTermQueryOptions(api),
        staleTime: 'static',
      }),
    ]);
  },
  component: CalendarRoute,
});

function CalendarRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <SettingsLayout>
      <CalendarPage
        page={search.page ?? 1}
        newYearOpen={search.dialog === 'new-year'}
        onPageChange={(page) => {
          void navigate({
            search: (previous) => ({
              ...previous,
              page: page > 1 ? page : undefined,
            }),
          });
        }}
        onNewYearOpenChange={(open) => {
          void navigate({
            search: (previous) => ({
              ...previous,
              dialog: open ? 'new-year' : undefined,
            }),
            replace: true,
          });
        }}
      />
    </SettingsLayout>
  );
}
