import { useQuery } from '@tanstack/react-query';
import { countOf, money } from '@eduvault/shared';
import { useApi } from '../../api';
import { dashboardFinanceQueryOptions } from '../../queries';
import { NullableStat, StatCard } from './dashboard-stat';

export function OwedStat() {
  const finance = useQuery(dashboardFinanceQueryOptions(useApi()));
  return (
    <NullableStat query={finance}>
      {({ currency, owedMinor, owingStudents }) => (
        <StatCard
          label="Still owed"
          value={money(owedMinor, currency)}
          sub={`${countOf(owingStudents, 'student', 'students')} ${owingStudents === 1 ? 'owes' : 'owe'}`}
          to="/finance/accounts"
        />
      )}
    </NullableStat>
  );
}
