import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ApiError,
  type PortalChild,
  type PortalMe,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { feesStat } from '@eduvault/shared';
import { ErrorMessage, PageSkeleton, TermSelect } from '@eduvault/ui';
import { useApi } from '../api';
import { NoChildren } from '../components/no-children';
import { GuardianFees } from '../components/wallet/guardian-fees';
import { PortalStatementCard } from '../components/portal-statement-card';
import { StatTile } from '../components/stat-tile';
import {
  calendarCurrentQueryOptions,
  portalStatementQueryOptions,
  portalWalletQueryOptions,
} from '../queries';
import { selectChild } from '../selected-child';

function ChildFees({
  child,
  termId,
  onTerm,
}: {
  child: PortalChild;
  termId: string | undefined;
  onTerm: (term: string | undefined) => void;
}) {
  const api = useApi();
  const [page, setPage] = useState<number | undefined>(undefined);
  const statement = useQuery(
    portalStatementQueryOptions(api, child.id, { page, termId })
  );
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
      <TermSelect
        terms={statement.data.termOptions}
        value={termId}
        onChange={(next) => {
          setPage(undefined);
          onTerm(next);
        }}
      />
      <PortalStatementCard statement={statement.data} onPage={setPage} />
    </section>
  );
}

interface FeesProps {
  me: PortalMe;
  child: PortalChild;
  term: string | undefined;
  onTerm: (term: string | undefined) => void;
}

const hasNoWallet = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 404;

function GuardianFeesLoader({ me, child, term, onTerm }: FeesProps) {
  const wallet = useQuery(portalWalletQueryOptions(useApi()));
  if (wallet.data !== undefined) {
    return (
      <GuardianFees
        me={me}
        child={child}
        wallet={wallet.data}
        termId={term}
        onTerm={onTerm}
      />
    );
  }
  if (wallet.isPending) {
    return <PageSkeleton rows={4} />;
  }
  return hasNoWallet(wallet.error) ? (
    <ChildFees child={child} termId={term} onTerm={onTerm} />
  ) : (
    <ErrorMessage error={wallet.error} />
  );
}

export function FeesPage({
  me,
  childId,
  term,
  onTerm,
}: {
  me: PortalMe;
  childId: string | undefined;
  term: string | undefined;
  onTerm: (term: string | undefined) => void;
}) {
  const hasWallet = useCan('wallet', 'readOwn');
  const selected = selectChild(me.children, childId);
  if (selected === undefined) {
    return <NoChildren />;
  }
  return hasWallet ? (
    <GuardianFeesLoader
      key={selected.id}
      me={me}
      child={selected}
      term={term}
      onTerm={onTerm}
    />
  ) : (
    <ChildFees
      key={selected.id}
      child={selected}
      termId={term}
      onTerm={onTerm}
    />
  );
}
