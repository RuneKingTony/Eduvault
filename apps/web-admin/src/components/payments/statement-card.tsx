import { Link } from '@tanstack/react-router';
import {
  ROW_STATUS_LABELS,
  isOwingStatus,
  type StatementRow,
  type StudentStatement,
} from '@eduvault/api-contract';
import {
  fmtDate,
  money,
  statementCallout,
  statementTiles,
  studentDetail,
  termStatementView,
} from '@eduvault/shared';
import { useCan } from '@eduvault/auth-client';
import {
  StatementCard as SharedStatementCard,
  Button,
  type StatementCardRow,
} from '@eduvault/ui';
import { searchFor } from '../../route-search-defaults';
import { PersonAvatar } from '../person-avatar';

function Described({ row }: { row: StatementRow }) {
  const { link } = row;
  if (link?.type === 'invoice') {
    return (
      <Link
        to="/finance/invoices/$invoiceId"
        params={{ invoiceId: link.id }}
        className="hover:underline"
      >
        {row.description}
      </Link>
    );
  }
  if (link?.type === 'payment') {
    return (
      <Link
        to="/finance/payments/$paymentId"
        params={{ paymentId: link.id }}
        search={{ recorded: undefined }}
        className="hover:underline"
      >
        {row.description}
      </Link>
    );
  }
  return <span>{row.description}</span>;
}

function rowsOf({ rows, currency }: StudentStatement): StatementCardRow[] {
  return rows.map((row) => ({
    key: `${row.entryId}-${row.status}`,
    date: fmtDate(row.effectiveOn),
    what: <Described row={row} />,
    note: row.reference,
    status: ROW_STATUS_LABELS[row.status],
    tone: isOwingStatus(row.status) ? 'owe' : 'paid',
    amount: money(row.amountMinor, currency),
  }));
}

function PayBackAction({ statement }: { statement: StudentStatement }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link
        to="/finance/adjustments"
        search={searchFor('/finance/adjustments', {
          new: 1,
          kind: 'refund',
          student: statement.student.id,
          amount: -statement.totals.balanceMinor,
        })}
      >
        Pay the extra back
      </Link>
    </Button>
  );
}

export function StatementCard({
  statement,
  onPage,
}: {
  statement: StudentStatement;
  onPage: (page: number) => void;
}) {
  const { student, totals, currency } = statement;
  const { broughtForward, footer } = termStatementView(statement, currency);
  const canPayBack = useCan('adjustment', 'create');
  const base = statementCallout(totals.balanceMinor, currency, { canPayBack });
  const callout =
    base === undefined
      ? undefined
      : {
          ...base,
          ...(canPayBack
            ? { action: <PayBackAction statement={statement} /> }
            : {}),
        };
  return (
    <SharedStatementCard
      heading={{
        avatar: <PersonAvatar name={student.name} />,
        name: student.name,
        detail: studentDetail(student),
      }}
      tiles={statementTiles(totals, currency)}
      {...(callout === undefined ? {} : { callout })}
      rows={rowsOf(statement)}
      {...(broughtForward === undefined ? {} : { broughtForward })}
      footer={footer}
      unpaid={statement.unpaid.map((item) => ({
        key: item.reference,
        label: `${item.reference} · ${money(item.outstandingMinor, currency)}`,
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
