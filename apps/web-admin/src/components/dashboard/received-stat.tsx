import { useQuery } from '@tanstack/react-query';
import { countOf, money } from '@eduvault/shared';
import { useApi } from '../../api';
import { dashboardFinanceQueryOptions } from '../../queries';
import { NullableStat, StatCard } from './dashboard-stat';

export function ReceivedStat() {
  const finance = useQuery(dashboardFinanceQueryOptions(useApi()));
  return (
    <NullableStat query={finance}>
      {({ currency, receivedMinor, paymentCount }) =>
        receivedMinor === undefined || paymentCount === undefined ? null : (
          <StatCard
            label="Received"
            value={money(receivedMinor, currency)}
            sub={countOf(paymentCount, 'payment', 'payments')}
            to="/finance/payments"
          />
        )
      }
    </NullableStat>
  );
}
