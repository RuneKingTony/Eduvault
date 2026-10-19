import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BanknoteIcon, UsersIcon } from 'lucide-react';
import {
  ApiError,
  type GuardianStatement,
  type StudentStatement,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  balanceTile,
  familyDescription,
  familyTotalSubline,
  money,
  termKeyOf,
  type TermPick,
} from '@eduvault/shared';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  ErrorMessage,
  NotFoundState,
  PageSkeleton,
  TermSelect,
} from '@eduvault/ui';
import { withTerm, type StatementSearch } from '../accounts-search';
import {
  AccountsLink,
  FamilyViewButton,
} from '../components/payments/payment-links';
import { useApi } from '../api';
import { RecordPaymentSheet } from '../components/payments/record-payment-sheet';
import { StatementCard } from '../components/payments/statement-card';
import { familyStatementQueryOptions, statementQueryOptions } from '../queries';

function Crumbs({ last }: { last: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <AccountsLink>Who owes</AccountsLink>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{last}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function NotFound() {
  return (
    <section className="flex flex-col gap-4">
      <Crumbs last="Not found" />
      <h1>Not found</h1>
      <NotFoundState
        title="No student account here"
        description="It may have been moved, or it may belong to a campus you don’t look after."
      >
        <Button asChild variant="outline">
          <AccountsLink>Back to who owes</AccountsLink>
        </Button>
      </NotFoundState>
    </section>
  );
}

function Actions({
  studentId,
  statement,
  familyView,
  term,
  onRecord,
}: {
  studentId: string;
  statement: StudentStatement;
  familyView: boolean;
  term: string | undefined;
  onRecord: () => void;
}) {
  const canRecord = useCan('payment', 'record');
  const { family } = statement;
  const children = family?.childCount ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children > 1 ? (
        <FamilyViewButton
          studentId={studentId}
          familyView={familyView}
          childCount={children}
          term={term}
        />
      ) : null}
      {canRecord ? (
        <Button type="button" onClick={onRecord}>
          <BanknoteIcon />
          Record payment
        </Button>
      ) : null}
    </div>
  );
}

function Header({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions}
    </header>
  );
}

function ChildStatement({
  initial,
  termId,
}: {
  initial: StudentStatement;
  termId: string | undefined;
}) {
  const [page, setPage] = useState<number | undefined>();
  const api = useApi();
  const query = useQuery({
    ...statementQueryOptions(api, initial.student.id, { page, termId }),
    ...(page === undefined ? { initialData: initial } : {}),
  });
  return <StatementCard statement={query.data ?? initial} onPage={setPage} />;
}

function FamilyTiles({ family }: { family: GuardianStatement }) {
  const { currency } = family;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {family.children.map((child) => {
        const tile = balanceTile(child.totals.balanceMinor, currency);
        return (
          <div
            key={child.student.id}
            className="flex flex-col rounded-lg border p-3"
          >
            <span className="text-xs text-muted-foreground">
              {child.student.name}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {tile.label === 'Owing' && tile.value === 'Nothing'
                ? tile.value
                : `${tile.label} ${tile.value}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {child.student.className ?? '—'}
            </span>
          </div>
        );
      })}
      <div className="flex flex-col rounded-lg border p-3">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <UsersIcon className="size-3.5" />
          Family total
        </span>
        <span className="text-lg font-semibold tabular-nums">
          {money(family.familyTotalMinor, currency)}
        </span>
        <span className="text-xs text-muted-foreground">
          {familyTotalSubline(
            family.familyTotalMinor,
            family.creditMinor,
            currency
          )}
        </span>
      </div>
    </div>
  );
}

function FamilyView({
  studentId,
  statement,
  term,
  onTerm,
  onRecord,
}: TermPick & {
  studentId: string;
  statement: StudentStatement;
  onRecord: () => void;
}) {
  const guardianId = statement.family?.guardianId ?? '';
  const family = useQuery({
    ...familyStatementQueryOptions(useApi(), guardianId, { termId: term }),
    enabled: guardianId !== '',
  });
  if (family.isError) {
    return <ErrorMessage error={family.error} />;
  }
  if (family.data === undefined) {
    return <PageSkeleton rows={2} />;
  }
  const shownTerm = family.data.term?.id;
  return (
    <>
      <Header
        title={`Family statement: ${family.data.guardian.name}`}
        description={familyDescription(family.data.children.length)}
        actions={
          <Actions
            studentId={studentId}
            statement={statement}
            familyView
            term={term}
            onRecord={onRecord}
          />
        }
      />
      <TermSelect
        terms={family.data.termOptions}
        value={term}
        onChange={onTerm}
      />
      <FamilyTiles family={family.data} />
      {family.data.children.map((child) => (
        <ChildStatement
          key={`${child.student.id}:${termKeyOf(shownTerm)}`}
          initial={child}
          termId={shownTerm}
        />
      ))}
    </>
  );
}

function SingleStatement({
  studentId,
  data,
  term,
  onTerm,
  onPage,
  onRecord,
}: TermPick & {
  studentId: string;
  data: StudentStatement;
  onPage: (page: number) => void;
  onRecord: () => void;
}) {
  return (
    <>
      <Header
        title={data.student.name}
        description="What was charged and what was paid."
        actions={
          <Actions
            studentId={studentId}
            statement={data}
            familyView={false}
            term={term}
            onRecord={onRecord}
          />
        }
      />
      <TermSelect terms={data.termOptions} value={term} onChange={onTerm} />
      <StatementCard statement={data} onPage={onPage} />
    </>
  );
}

function StatementBody({
  studentId,
  data,
  search,
  onSearchChange,
  onRecord,
}: {
  studentId: string;
  data: StudentStatement;
  search: StatementSearch;
  onSearchChange: (next: StatementSearch) => void;
  onRecord: () => void;
}) {
  const pick: TermPick = {
    term: search.term,
    onTerm: (term) => {
      onSearchChange(withTerm(search, term));
    },
  };
  return search.view === 'family' && data.family !== null ? (
    <FamilyView
      {...pick}
      studentId={studentId}
      statement={data}
      onRecord={onRecord}
    />
  ) : (
    <SingleStatement
      {...pick}
      studentId={studentId}
      data={data}
      onRecord={onRecord}
      onPage={(page) => {
        onSearchChange({ ...search, page });
      }}
    />
  );
}

export function StatementPage({
  studentId,
  search,
  onSearchChange,
}: {
  studentId: string;
  search: StatementSearch;
  onSearchChange: (next: StatementSearch) => void;
}) {
  const [recording, setRecording] = useState(false);
  const statement = useQuery(
    statementQueryOptions(useApi(), studentId, {
      page: search.page,
      termId: search.term,
    })
  );
  const canRecord = useCan('payment', 'record');
  if (statement.error instanceof ApiError && statement.error.status === 404) {
    return <NotFound />;
  }
  if (statement.isError) {
    return <ErrorMessage error={statement.error} />;
  }
  if (statement.data === undefined) {
    return <PageSkeleton rows={2} />;
  }
  const data = statement.data;
  return (
    <section className="flex flex-col gap-4">
      <Crumbs last={data.student.name} />
      <StatementBody
        studentId={studentId}
        data={data}
        search={search}
        onSearchChange={onSearchChange}
        onRecord={() => {
          setRecording(true);
        }}
      />
      {canRecord ? (
        <RecordPaymentSheet
          open={recording}
          prefill={{ guardianId: data.family?.guardianId, studentId }}
          stay
          onOpenChange={setRecording}
        />
      ) : null}
    </section>
  );
}
