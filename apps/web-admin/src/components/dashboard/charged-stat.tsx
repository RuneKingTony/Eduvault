import { useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@eduvault/ui';
import { money } from '@eduvault/shared';
import { useApi } from '../../api';
import { dashboardChargedQueryOptions } from '../../queries';
import { StatCard, StatSkeleton } from './dashboard-stat';

export function ChargedStat() {
  const charged = useQuery(dashboardChargedQueryOptions(useApi()));
  if (charged.isPending) {
    return <StatSkeleton />;
  }
  if (charged.data === undefined) {
    return <ErrorMessage error={charged.error} />;
  }
  if (charged.data === null) {
    return null;
  }
  return (
    <StatCard
      label="Charged this term"
      value={money(charged.data.chargedMinor, charged.data.currency)}
      sub={charged.data.termName}
      to="/finance/invoices"
    />
  );
}
