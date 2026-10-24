import type { PortalStatement, Wallet } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { money, walletMoney } from '@eduvault/shared';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@eduvault/ui';
import type { EarmarkKind } from './earmark-dialog';

function UnpaidList({ statement }: { statement: PortalStatement }) {
  if (statement.unpaid.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No unpaid charges right now.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {statement.unpaid.map((charge) => (
        <li
          key={`${charge.number}-${charge.outstandingMinor}`}
          className="flex justify-between gap-3 tabular-nums"
        >
          <span>{charge.number}</span>
          <span>{money(charge.outstandingMinor, statement.currency)}</span>
        </li>
      ))}
    </ul>
  );
}

function EarmarkActions({
  setAside,
  onEarmark,
}: {
  setAside: number;
  onEarmark: (kind: EarmarkKind) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onEarmark('set');
        }}
      >
        Set aside
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={setAside === 0}
        onClick={() => {
          onEarmark('release');
        }}
      >
        Release
      </Button>
    </div>
  );
}

export function ChildChargesCard({
  statement,
  wallet,
  onEarmark,
}: {
  statement: PortalStatement;
  wallet: Wallet;
  onEarmark: (kind: EarmarkKind) => void;
}) {
  const canSpend = useCan('wallet', 'spend');
  const setAside =
    wallet.children.find((child) => child.studentId === statement.student.id)
      ?.earmarkMinor ?? 0;
  return (
    <Card role="group" aria-label="Charges">
      <CardHeader>
        <CardTitle>Charges</CardTitle>
        <CardDescription>
          {statement.student.name} · {walletMoney(setAside, statement.currency)}{' '}
          set aside
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <UnpaidList statement={statement} />
        {canSpend ? (
          <EarmarkActions setAside={setAside} onEarmark={onEarmark} />
        ) : null}
      </CardContent>
    </Card>
  );
}
