import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ReceiptTextIcon } from 'lucide-react';
import type { StudentStatement } from '@eduvault/api-contract';
import { useCanAny } from '@eduvault/auth-client';
import { FINANCE_READ_GATE } from '@eduvault/policy';
import { statementTiles } from '@eduvault/shared';
import {
  Button,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  MONEY_TILES_CLASS,
  MoneyTiles,
  Skeleton,
} from '@eduvault/ui';
import { useApi } from '../api';
import { statementQueryOptions } from '../queries';
import { searchFor } from '../route-search-defaults';

function Tiles({ statement }: { statement: UseQueryResult<StudentStatement> }) {
  const { data } = statement;
  if (data !== undefined) {
    return <MoneyTiles tiles={statementTiles(data.totals, data.currency)} />;
  }
  if (statement.isError) {
    return <ErrorMessage error={statement.error} />;
  }
  return (
    <div role="status" aria-label="Loading" className={MONEY_TILES_CLASS}>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function MoneySummary({ studentId }: { studentId: string }) {
  const statement = useQuery(statementQueryOptions(useApi(), studentId));
  return (
    <div className="flex flex-col gap-4">
      <Tiles statement={statement} />
      <div>
        <Button asChild>
          <Link
            to="/finance/accounts/$studentId"
            params={{ studentId }}
            search={searchFor('/finance/accounts/$studentId')}
          >
            <ReceiptTextIcon />
            Open statement
          </Link>
        </Button>
      </div>
    </div>
  );
}

function NoFees() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ReceiptTextIcon />
        </EmptyMedia>
        <EmptyTitle>No fees to show</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

export function StudentFeesTab({ studentId }: { studentId: string }) {
  if (!useCanAny(FINANCE_READ_GATE)) {
    return <NoFees />;
  }
  return <MoneySummary studentId={studentId} />;
}
