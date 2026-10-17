import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PortalChild, PortalMe } from '@eduvault/api-contract';
import { feesStat } from '@eduvault/shared';
import { ErrorMessage, PageSkeleton } from '@eduvault/ui';
import { useApi } from '../api';
import { NoChildren } from '../components/no-children';
import { PortalStatementCard } from '../components/portal-statement-card';
import { StatTile } from '../components/stat-tile';
import {
  calendarCurrentQueryOptions,
  portalStatementQueryOptions,
} from '../queries';
import { selectChild } from '../selected-child';

function ChildFees({ child }: { child: PortalChild }) {
  const api = useApi();
  const [page, setPage] = useState<number | undefined>(undefined);
  const statement = useQuery(portalStatementQueryOptions(api, child.id, page));
  const calendar = useQuery(calendarCurrentQueryOptions(api));
  if (statement.data === undefined) {
    return statement.isPending ? (
      <PageSkeleton rows={4} />
    ) : (
      <ErrorMessage error={statement.error} />
    );
  }
  const term = calendar.data?.term ?? null;
  const schoolYear = calendar.data?.schoolYear ?? null;
  const stat = feesStat(
    statement.data.totals.balanceMinor,
    statement.data.currency
  );
  const period =
    term === null || schoolYear === null
      ? ''
      : ` · ${term.name} ${schoolYear.name}`;
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1>Fees</h1>
        <p className="text-muted-foreground">
          {child.firstName} {child.lastName}
          {period}
        </p>
      </header>
      <div className="grid grid-cols-2 gap-4">
        <StatTile label={stat.label} value={stat.value} sub={stat.sub} />
      </div>
      <h2>Statement</h2>
      <PortalStatementCard statement={statement.data} onPage={setPage} />
    </section>
  );
}

export function FeesPage({
  me,
  childId,
}: {
  me: PortalMe;
  childId: string | undefined;
}) {
  const selected = selectChild(me.children, childId);
  if (selected === undefined) {
    return <NoChildren />;
  }
  return <ChildFees key={selected.id} child={selected} />;
}
