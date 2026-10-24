import {
  rowStatusLabel,
  rowTone,
  type PortalStatement,
} from '@eduvault/api-contract';
import { UserAvatar } from '@eduvault/auth-client';
import {
  fmtDate,
  money,
  statementCallout,
  statementTiles,
  studentDetail,
  termStatementView,
} from '@eduvault/shared';
import { StatementCard, type StatementCardRow } from '@eduvault/ui';

function rowsOf({ rows, currency }: PortalStatement): StatementCardRow[] {
  return rows.map((row, index) => ({
    key: `${row.effectiveOn}-${row.status}-${index}`,
    date: fmtDate(row.effectiveOn),
    what: <span>{row.description}</span>,
    status: rowStatusLabel(row),
    tone: rowTone(row),
    amount: money(row.amountMinor, currency),
  }));
}

export function PortalStatementCard({
  statement,
  onPage,
  showUnpaid = true,
}: {
  statement: PortalStatement;
  onPage: (page: number) => void;
  showUnpaid?: boolean;
}) {
  const { student, totals, currency } = statement;
  const { broughtForward, footer } = termStatementView(statement, currency);
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
      {...(broughtForward === undefined ? {} : { broughtForward })}
      footer={footer}
      unpaid={
        showUnpaid
          ? statement.unpaid.map((item, index) => ({
              key: `${item.number}-${index}`,
              label: `${item.number} · ${money(item.outstandingMinor, currency)}`,
            }))
          : []
      }
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
