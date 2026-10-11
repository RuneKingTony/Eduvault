import { useQuery } from '@tanstack/react-query';
import type { PortalChild, PortalMe } from '@eduvault/api-contract';
import { UserAvatar } from '@eduvault/auth-client';
import { countOf } from '@eduvault/shared';
import { Card, CardContent, ErrorMessage, PageSkeleton } from '@eduvault/ui';
import { useApi } from '../api';
import { NoChildren } from '../components/no-children';
import { portalChildrenQueryOptions } from '../queries';

function ChildCard({
  child,
  onOpen,
}: {
  child: PortalChild;
  onOpen: (childId: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="w-full rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          onOpen(child.id);
        }}
      >
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <span aria-hidden="true" className="contents">
              <UserAvatar
                name={`${child.firstName} ${child.lastName}`}
                className="size-16 text-xl"
              />
            </span>
            <span className="font-medium">
              {child.firstName} {child.lastName}
            </span>
            <span className="text-sm text-muted-foreground">
              {child.className ?? '—'} · {child.campusName}
              {child.archived ? ' · archived' : ''}
            </span>
          </CardContent>
        </Card>
      </button>
    </li>
  );
}

export function ChildrenPage({
  me,
  onOpenChild,
}: {
  me: PortalMe;
  onOpenChild: (childId: string) => void;
}) {
  const children = useQuery(portalChildrenQueryOptions(useApi()));
  if (children.isPending) {
    return <PageSkeleton rows={3} />;
  }
  if (children.data === undefined) {
    return <ErrorMessage error={children.error} />;
  }
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1>Hello, {me.firstName}</h1>
        <p className="text-muted-foreground">
          {countOf(children.data.length, 'child', 'children')} at{' '}
          {me.school.name}.
        </p>
      </header>
      {children.data.length === 0 ? (
        <NoChildren />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.data.map((child) => (
            <ChildCard key={child.id} child={child} onOpen={onOpenChild} />
          ))}
        </ul>
      )}
    </section>
  );
}
