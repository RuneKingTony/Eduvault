import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@eduvault/ui';

export function ApprovalsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Approvals</h1>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing to approve</EmptyTitle>
          <EmptyDescription>
            Requests that need a second pair of eyes will wait here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </section>
  );
}
