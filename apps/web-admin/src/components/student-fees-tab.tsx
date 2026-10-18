import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ReceiptTextIcon } from 'lucide-react';
import type { StudentStatement } from '@eduvault/api-contract';
import { useCan, useCanAny } from '@eduvault/auth-client';
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
import { feeOptionsQueryOptions, statementQueryOptions } from '../queries';
import { searchFor } from '../route-search-defaults';
import { OptionalFeesCard } from './fees/optional-fees-card';

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

export function StudentFeesTab({
  studentId,
  firstName,
}: {
  studentId: string;
  firstName: string;
}) {
  const canFinance = useCanAny(FINANCE_READ_GATE);
  const canOptions = useCan('feeLine', 'read');
  const options = useQuery({
    ...feeOptionsQueryOptions(useApi(), studentId),
    enabled: canOptions,
  });
  const showOptions = canOptions && options.data?.length !== 0;
  if (!canFinance && !showOptions) {
    return <NoFees />;
  }
  return (
    <div className="flex flex-col gap-4">
      {canFinance ? <MoneySummary studentId={studentId} /> : null}
      {showOptions ? (
        <OptionalFeesCard
          studentId={studentId}
          firstName={firstName}
          options={options}
        />
      ) : null}
    </div>
  );
}
