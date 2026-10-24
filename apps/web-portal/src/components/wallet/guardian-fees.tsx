import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PortalChild, PortalMe, Wallet } from '@eduvault/api-contract';
import { feesStat } from '@eduvault/shared';
import { ErrorMessage, PageSkeleton, TermSelect } from '@eduvault/ui';
import { useApi } from '../../api';
import {
  calendarCurrentQueryOptions,
  portalStatementQueryOptions,
} from '../../queries';
import { PortalStatementCard } from '../portal-statement-card';
import { StatTile } from '../stat-tile';
import { ChildChargesCard } from './child-charges-card';
import { EarmarkDialog, type EarmarkKind } from './earmark-dialog';
import { familyBalanceMinor } from './family-balance';
import { PayFromWalletDialog } from './pay-dialog';
import { RefundNote } from './refund-note';
import { WalletHistoryCard } from './wallet-history-card';
import { WalletSection } from './wallet-section';

type OpenDialog = { kind: 'pay' } | { kind: 'earmark'; earmark: EarmarkKind };

function ChildSection({
  child,
  wallet,
  termId,
  onTerm,
  onEarmark,
}: {
  child: PortalChild;
  wallet: Wallet;
  termId: string | undefined;
  onTerm: (term: string | undefined) => void;
  onEarmark: (kind: EarmarkKind) => void;
}) {
  const api = useApi();
  const [page, setPage] = useState<number | undefined>(undefined);
  const statement = useQuery(
    portalStatementQueryOptions(api, child.id, { page, termId })
  );
  if (statement.data === undefined) {
    return statement.isPending ? (
      <PageSkeleton rows={4} />
    ) : (
      <ErrorMessage error={statement.error} />
    );
  }
  return (
    <section
      aria-label={`${child.firstName} ${child.lastName}`}
      className="flex flex-col gap-4"
    >
      <ChildChargesCard
        statement={statement.data}
        wallet={wallet}
        onEarmark={onEarmark}
      />
      <h2>Statement</h2>
      <TermSelect
        terms={statement.data.termOptions}
        value={termId}
        onChange={(next) => {
          setPage(undefined);
          onTerm(next);
        }}
      />
      <PortalStatementCard
        statement={statement.data}
        onPage={setPage}
        showUnpaid={false}
      />
    </section>
  );
}

function FeesHeader({ child }: { child: PortalChild }) {
  const calendar = useQuery(calendarCurrentQueryOptions(useApi()));
  const term = calendar.data?.term ?? null;
  const schoolYear = calendar.data?.schoolYear ?? null;
  const period =
    term === null || schoolYear === null
      ? ''
      : ` · ${term.name} ${schoolYear.name}`;
  return (
    <header>
      <h1>Fees</h1>
      <p className="text-muted-foreground">
        {child.firstName} {child.lastName}
        {period}
      </p>
    </header>
  );
}

function WalletDialogs({
  wallet,
  studentId,
  dialog,
  onClose,
}: {
  wallet: Wallet;
  studentId: string;
  dialog: OpenDialog | null;
  onClose: () => void;
}) {
  return (
    <>
      <PayFromWalletDialog
        wallet={wallet}
        open={dialog?.kind === 'pay'}
        onClose={onClose}
      />
      <EarmarkDialog
        wallet={wallet}
        kind={dialog?.kind === 'earmark' ? dialog.earmark : 'set'}
        studentId={studentId}
        open={dialog?.kind === 'earmark'}
        onClose={onClose}
      />
    </>
  );
}

export function GuardianFees({
  me,
  child,
  wallet,
  termId,
  onTerm,
}: {
  me: PortalMe;
  child: PortalChild;
  wallet: Wallet;
  termId: string | undefined;
  onTerm: (term: string | undefined) => void;
}) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const owing = feesStat(familyBalanceMinor(wallet.children), wallet.currency);
  return (
    <div className="flex flex-col gap-6">
      <FeesHeader child={child} />
      <WalletSection
        wallet={wallet}
        onPay={() => {
          setDialog({ kind: 'pay' });
        }}
      />
      <div className="grid grid-cols-2 gap-4">
        <StatTile label={owing.label} value={owing.value} sub={owing.sub} />
      </div>
      <ChildSection
        key={child.id}
        child={child}
        wallet={wallet}
        termId={termId}
        onTerm={onTerm}
        onEarmark={(earmark) => {
          setDialog({ kind: 'earmark', earmark });
        }}
      />
      <WalletHistoryCard />
      <RefundNote email={me.school.email} />
      <WalletDialogs
        wallet={wallet}
        studentId={child.id}
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </div>
  );
}
