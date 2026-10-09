import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@eduvault/ui';

export function DashboardPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Dashboard</h1>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>
            Your school at a glance will show up here as the other pages come
            online.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </section>
  );
}
