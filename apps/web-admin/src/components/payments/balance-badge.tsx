import { money } from '@eduvault/shared';
import { Badge } from '@eduvault/ui';

export function BalanceBadge({
  balanceMinor,
  currency,
}: {
  balanceMinor: number;
  currency: string;
}) {
  if (balanceMinor > 0) {
    return <Badge variant="destructive">{money(balanceMinor, currency)}</Badge>;
  }
  if (balanceMinor < 0) {
    return (
      <Badge variant="success">
        {money(-balanceMinor, currency)} extra paid
      </Badge>
    );
  }
  return <Badge variant="outline">Paid up</Badge>;
}
