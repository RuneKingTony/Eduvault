import { Link } from '@tanstack/react-router';
import type { BalanceSummary } from '@eduvault/api-contract';
import { countOf, money } from '@eduvault/shared';
import { Card, CardContent } from '@eduvault/ui';
import { NO_PAYMENT_FILTERS } from '../../payments-search';

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </>
  );
}

const TILE =
  'block h-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function AccountTiles({
  summary,
  currency,
  onOwing,
}: {
  summary: BalanceSummary;
  currency: string;
  onOwing: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <button type="button" className={TILE} onClick={onOwing}>
        <Card className="h-full">
          <CardContent>
            <Tile
              label="Total owed"
              value={money(summary.totalOwedMinor, currency)}
              note={summary.scopeNote}
            />
          </CardContent>
        </Card>
      </button>
      <button type="button" className={TILE} onClick={onOwing}>
        <Card className="h-full">
          <CardContent>
            <Tile
              label="Students owing"
              value={String(summary.studentsOwing)}
              note={`out of ${countOf(summary.studentsInScope, 'student', 'students')}`}
            />
          </CardContent>
        </Card>
      </button>
      <Link to="/finance/payments" search={NO_PAYMENT_FILTERS} className={TILE}>
        <Card className="h-full">
          <CardContent>
            <Tile
              label="Received this term"
              value={money(summary.receivedThisTermMinor, currency)}
              note={countOf(summary.paymentsThisTerm, 'payment', 'payments')}
            />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
