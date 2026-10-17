import { Link } from '@tanstack/react-router';
import type { BalanceSummary } from '@eduvault/api-contract';
import { countOf, money } from '@eduvault/shared';
import { Card, CardContent } from '@eduvault/ui';
import { searchFor } from '../../route-search-defaults';

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
  const { receivedThisTermMinor: received, paymentsThisTerm: payments } =
    summary;
  const showReceived = received !== undefined && payments !== undefined;
  return (
    <div
      className={`grid gap-3 ${showReceived ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
    >
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
      {showReceived ? (
        <Link
          to="/finance/payments"
          search={searchFor('/finance/payments')}
          className={TILE}
        >
          <Card className="h-full">
            <CardContent>
              <Tile
                label="Received this term"
                value={money(received, currency)}
                note={countOf(payments, 'payment', 'payments')}
              />
            </CardContent>
          </Card>
        </Link>
      ) : null}
    </div>
  );
}
