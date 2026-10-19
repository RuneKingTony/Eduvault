import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  PortalChild,
  PortalFamilyStatement,
  PortalMe,
} from '@eduvault/api-contract';
import { UserAvatar, useCan } from '@eduvault/auth-client';
import {
  balanceBadgeVariant,
  balanceTone,
  countOf,
  familyTotalSubline,
  feesTile,
  money,
  portalBalanceLine,
  termKeyOf,
  type TermPick,
} from '@eduvault/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ErrorMessage,
  PageSkeleton,
  TermSelect,
} from '@eduvault/ui';
import { useApi } from '../api';
import { NoChildren } from '../components/no-children';
import { PortalStatementCard } from '../components/portal-statement-card';
import { StatTile } from '../components/stat-tile';
import {
  portalChildrenQueryOptions,
  portalFamilyStatementQueryOptions,
  portalStatementQueryOptions,
} from '../queries';

interface Fees {
  currency: string;
  onSeeFees: (childId: string) => void;
}

function FeeRow({ child, fees }: { child: PortalChild; fees: Fees }) {
  const balance = child.balanceMinor ?? 0;
  return (
    <>
      <span className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">School fees</span>
        <Badge variant={balanceBadgeVariant(balance)}>
          {portalBalanceLine(balance, fees.currency)}
        </Badge>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          fees.onSeeFees(child.id);
        }}
      >
        See fees
      </Button>
    </>
  );
}

function ChildCard({
  child,
  fees,
  onOpen,
}: {
  child: PortalChild;
  fees?: Fees;
  onOpen: (childId: string) => void;
}) {
  return (
    <li>
      <Card className="h-full">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <button
            type="button"
            className="flex flex-col items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              onOpen(child.id);
            }}
          >
            <span aria-hidden="true" className="contents">
              <UserAvatar
                name={`${child.firstName} ${child.lastName}`}
                className="size-16 text-xl"
              />
            </span>
            <span className="font-medium">
              {child.firstName} {child.lastName}
            </span>
            <span className="text-sm text-muted-foreground">
              {child.className ?? '—'} · {child.campusName}
              {child.archived ? ' · archived' : ''}
            </span>
          </button>
          {fees === undefined ? null : <FeeRow child={child} fees={fees} />}
        </CardContent>
      </Card>
    </li>
  );
}

function ChildCards({
  list,
  fees,
  onOpenChild,
}: {
  list: readonly PortalChild[];
  fees?: Fees;
  onOpenChild: (childId: string) => void;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((child) => (
        <ChildCard
          key={child.id}
          child={child}
          onOpen={onOpenChild}
          {...(fees === undefined ? {} : { fees })}
        />
      ))}
    </ul>
  );
}

function ChildStatement({
  studentId,
  termId,
}: {
  studentId: string;
  termId: string | undefined;
}) {
  const [page, setPage] = useState<number | undefined>(undefined);
  const statement = useQuery(
    portalStatementQueryOptions(useApi(), studentId, { page, termId })
  );
  if (statement.data === undefined) {
    return statement.isPending ? (
      <PageSkeleton rows={3} />
    ) : (
      <ErrorMessage error={statement.error} />
    );
  }
  return <PortalStatementCard statement={statement.data} onPage={setPage} />;
}

function FamilyTiles({ family }: { family: PortalFamilyStatement }) {
  const { currency } = family;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {family.children.map((child) => {
        const tile = feesTile(child.balanceMinor, currency);
        return (
          <StatTile
            key={child.studentId}
            label={child.name}
            value={tile.value}
            sub={tile.sub}
            tone={balanceTone(child.balanceMinor)}
          />
        );
      })}
      <StatTile
        label="Family total"
        value={money(family.totalOwedMinor, currency)}
        sub={familyTotalSubline(
          family.totalOwedMinor,
          family.creditMinor,
          currency
        )}
        tone={balanceTone(family.totalOwedMinor)}
      />
    </div>
  );
}

function FamilyStatementSection({
  family,
  term,
  onTerm,
}: TermPick & { family: PortalFamilyStatement }) {
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2>Family statement</h2>
        <p className="text-muted-foreground">
          Total owed{' '}
          <strong className="text-foreground">
            {money(family.totalOwedMinor, family.currency)}
          </strong>
        </p>
      </header>
      <TermSelect terms={family.termOptions} value={term} onChange={onTerm} />
      {family.children.length > 1 ? <FamilyTiles family={family} /> : null}
      {family.children.map((child) => (
        <ChildStatement
          key={`${child.studentId}:${termKeyOf(term)}`}
          studentId={child.studentId}
          termId={term}
        />
      ))}
    </section>
  );
}

function FamilyStatement({ term, onTerm }: TermPick) {
  const family = useQuery(
    portalFamilyStatementQueryOptions(useApi(), { termId: term })
  );
  if (family.data === undefined) {
    return family.isPending ? (
      <PageSkeleton rows={3} />
    ) : (
      <ErrorMessage error={family.error} />
    );
  }
  return (
    <FamilyStatementSection family={family.data} term={term} onTerm={onTerm} />
  );
}

function ChildrenBody({
  list,
  currency,
  term,
  onTerm,
  onOpenChild,
  onSeeFees,
}: TermPick & {
  list: readonly PortalChild[];
  currency: string;
  onOpenChild: (childId: string) => void;
  onSeeFees: (childId: string) => void;
}) {
  const canSeeFees = useCan('invoice', 'readOwn');
  if (list.length === 0) {
    return <NoChildren />;
  }
  return canSeeFees ? (
    <>
      <ChildCards
        list={list}
        fees={{ currency, onSeeFees }}
        onOpenChild={onOpenChild}
      />
      <FamilyStatement term={term} onTerm={onTerm} />
    </>
  ) : (
    <ChildCards list={list} onOpenChild={onOpenChild} />
  );
}

export function ChildrenPage({
  me,
  term,
  onTerm,
  onOpenChild,
  onSeeFees,
}: TermPick & {
  me: PortalMe;
  onOpenChild: (childId: string) => void;
  onSeeFees: (childId: string) => void;
}) {
  const children = useQuery(portalChildrenQueryOptions(useApi()));
  const canSeeFees = useCan('invoice', 'readOwn');
  if (children.isPending) {
    return <PageSkeleton rows={3} />;
  }
  if (children.data === undefined) {
    return <ErrorMessage error={children.error} />;
  }
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1>Hello, {me.firstName}</h1>
        <p className="text-muted-foreground">
          {countOf(children.data.length, 'child', 'children')} at{' '}
          {me.school.name}.{canSeeFees ? ' Here is what each one owes.' : ''}
        </p>
      </header>
      <ChildrenBody
        list={children.data}
        currency={me.school.currency}
        term={term}
        onTerm={onTerm}
        onOpenChild={onOpenChild}
        onSeeFees={onSeeFees}
      />
    </section>
  );
}
