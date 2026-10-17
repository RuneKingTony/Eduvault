import { useQuery } from '@tanstack/react-query';
import { money } from '@eduvault/shared';
import { useApi } from '../../api';
import { dashboardChargedQueryOptions } from '../../queries';
import { NullableStat, StatCard } from './dashboard-stat';

export function ChargedStat() {
  const charged = useQuery(dashboardChargedQueryOptions(useApi()));
  return (
    <NullableStat query={charged}>
      {({ chargedMinor, currency, termName }) => (
        <StatCard
          label="Charged this term"
          value={money(chargedMinor, currency)}
          sub={termName}
          to="/finance/invoices"
        />
      )}
    </NullableStat>
  );
}
