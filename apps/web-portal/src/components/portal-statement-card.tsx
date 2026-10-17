import {
  ROW_STATUS_LABELS,
  isOwingStatus,
  type PortalStatement,
} from '@eduvault/api-contract';
import { UserAvatar } from '@eduvault/auth-client';
import {
  entriesFooter,
  fmtDate,
  money,
  statementCallout,
  statementTiles,
  studentDetail,
} from '@eduvault/shared';
import { StatementCard, type StatementCardRow } from '@eduvault/ui';

function rowsOf({ rows, currency }: PortalStatement): StatementCardRow[] {
  return rows.map((row, index) => ({
    key: `${row.effectiveOn}-${row.status}-${index}`,
    date: fmtDate(row.effectiveOn),
    what: <span>{row.description}</span>,
    status: ROW_STATUS_LABELS[row.status],
    tone: isOwingStatus(row.status) ? 'owe' : 'paid',
    amount: money(row.amountMinor, currency),
  }));
}

export function PortalStatementCard({
  statement,
  onPage,
}: {
  statement: PortalStatement;
  onPage: (page: number) => void;
}) {
  const { student, totals, currency } = statement;
  const callout = statementCallout(totals.balanceMinor, currency, {
    canPayBack: false,
  });
  return (
    <StatementCard
      heading={{
        avatar: <UserAvatar name={student.name} />,
        name: student.name,
        detail: studentDetail(student),
      }}
      tiles={statementTiles(totals, currency)}
      {...(callout === undefined ? {} : { callout })}
      rows={rowsOf(statement)}
      footer={entriesFooter(totals.balanceMinor, currency)}
      unpaid={statement.unpaid.map((item, index) => ({
        key: `${item.number}-${index}`,
        label: `${item.number} · ${money(item.outstandingMinor, currency)}`,
      }))}
      pager={{
        page: statement.page,
        total: statement.total,
        pageSize: statement.pageSize,
        onPage,
      }}
      emptyText="No entries yet"
    />
  );
}
