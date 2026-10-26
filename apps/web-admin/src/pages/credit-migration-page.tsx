import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WalletIcon } from 'lucide-react';
import {
  CREDIT_MIGRATION_CHANGED_MESSAGE,
  type CreditMigrationReport,
} from '@eduvault/api-contract';
import { countOf, walletMoney } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@eduvault/ui';
import { useApi } from '../api';
import { DetailCrumbs } from '../components/detail-page';
import { QueryState } from '../components/money/query-state';
import { ConfirmMove } from '../components/wallets/credit-migration-confirm';
import { FamiliesCard } from '../components/wallets/credit-migration-families';
import { NotMovedCard } from '../components/wallets/credit-migration-not-moved';
import { WalletsLink } from '../components/wallets/wallet-links';
import { creditMigrationQueryOptions } from '../queries';

function SummaryLine({ report }: { report: CreditMigrationReport }) {
  const { totals, currency } = report;
  return (
    <p className="text-sm text-muted-foreground">
      {countOf(totals.familyCount, 'family', 'families')} ·{' '}
      {countOf(totals.childCount, 'child', 'children')} ·{' '}
      {walletMoney(totals.movableMinor, currency)} to move ·{' '}
      {walletMoney(totals.notMovedMinor, currency)} can’t be moved
    </p>
  );
}

function NothingToMove() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WalletIcon />
        </EmptyMedia>
        <EmptyTitle>No credit to move</EmptyTitle>
        <EmptyDescription>
          No child has credit that a family wallet can take right now.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ReportBody({
  report,
  changed,
  onChanged,
}: {
  report: CreditMigrationReport;
  changed: boolean;
  onChanged: (changed: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const nothing = report.families.length === 0;
  return (
    <>
      {changed ? (
        <Alert role="alert">
          <AlertDescription>
            {CREDIT_MIGRATION_CHANGED_MESSAGE}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SummaryLine report={report} />
        <Button
          type="button"
          disabled={nothing}
          onClick={() => {
            onChanged(false);
            setConfirming(true);
          }}
        >
          Move credit
        </Button>
      </div>
      {nothing ? (
        <NothingToMove />
      ) : (
        <FamiliesCard families={report.families} currency={report.currency} />
      )}
      {report.notMoved.length > 0 ? (
        <NotMovedCard students={report.notMoved} currency={report.currency} />
      ) : null}
      {confirming ? (
        <ConfirmMove
          report={report}
          onClose={() => {
            setConfirming(false);
          }}
          onChanged={() => {
            onChanged(true);
          }}
        />
      ) : null}
    </>
  );
}

export function CreditMigrationPage() {
  const report = useQuery(creditMigrationQueryOptions(useApi()));
  const [changed, setChanged] = useState(false);
  return (
    <section className="flex flex-col gap-4">
      <DetailCrumbs
        parent={<WalletsLink>Wallets</WalletsLink>}
        last="Move existing credit"
      />
      <header className="flex flex-col gap-1">
        <h1>Move existing credit</h1>
        <p className="text-sm text-muted-foreground">
          Credit families paid ahead on a child’s fee account moves to the
          family wallet. Debts and history stay as they are.
        </p>
      </header>
      <QueryState query={report} skeletonClassName="h-48">
        {(data) => (
          <ReportBody report={data} changed={changed} onChanged={setChanged} />
        )}
      </QueryState>
    </section>
  );
}
