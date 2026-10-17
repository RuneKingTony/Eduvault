import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { GraduationCapIcon } from 'lucide-react';
import type { DashboardRoll, StudentTab } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorMessage,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  currentTermQueryOptions,
  dashboardRollQueryOptions,
} from '../../queries';
import { CardSkeleton } from './card-states';
import { StatCard, StatSkeleton } from './dashboard-stat';

const VALUE_WIDTH = 'min-w-16 text-right';
const OWED_WIDTH = 'min-w-28 text-right';

interface RollLine {
  tab: StudentTab;
  label: string;
  sub: string;
  value: number;
  owed?: string;
  indent?: boolean;
}

function RollRow({ line }: { line: RollLine }) {
  return (
    <li>
      <Link
        to="/students"
        search={{ tab: line.tab === 'active' ? undefined : line.tab }}
        className={`flex items-center justify-between gap-3 rounded-md p-3 hover:bg-muted/50 ${line.indent === true ? 'pl-8' : ''}`}
      >
        <span className="flex flex-col">
          <span className="font-medium">{line.label}</span>
          <span className="text-sm text-muted-foreground">{line.sub}</span>
        </span>
        <span className="flex items-baseline gap-6">
          <span className={`text-lg font-semibold ${VALUE_WIDTH}`}>
            {line.value}
          </span>
          {line.owed === undefined ? null : (
            <span className={`text-sm text-muted-foreground ${OWED_WIDTH}`}>
              Owed {line.owed}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

type OwedBucket = keyof NonNullable<DashboardRoll['owedMinor']>;
type OwedOf = (bucket: OwedBucket) => string | undefined;

const NO_OWED_FIGURE: OwedOf = () => undefined;

function rollLines(
  data: DashboardRoll,
  year: string | undefined,
  owedOf: OwedOf
): RollLine[] {
  return [
    {
      tab: 'active',
      label: 'Active',
      sub: 'On the roll and billed',
      value: data.active,
      owed: owedOf('active'),
    },
    {
      tab: 'new',
      label: 'New intakes',
      sub: year === undefined ? 'Admitted this year' : `Admitted in ${year}`,
      value: data.newIntakes,
      owed: owedOf('newIntakes'),
      indent: true,
    },
    {
      tab: 'inactive',
      label: 'Inactive',
      sub: `${data.dueLeft} due to be marked Left`,
      value: data.inactive,
      owed: owedOf('inactive'),
    },
    {
      tab: 'left',
      label: 'Left',
      sub: `${data.leftThisTerm} this term`,
      value: data.left,
      owed: owedOf('left'),
    },
    {
      tab: 'graduated',
      label: 'Graduated',
      sub: 'Finished the final class',
      value: data.graduated,
      owed: owedOf('graduated'),
    },
  ];
}

interface OwedFigures {
  of: OwedOf;
  former: string | null;
}

function owedFigures(data: DashboardRoll): OwedFigures | null {
  const { currency, owedMinor, formerOwedMinor = 0 } = data;
  if (owedMinor === undefined || currency === undefined) {
    return null;
  }
  return {
    of: (bucket) =>
      owedMinor[bucket] === 0 ? '—' : money(owedMinor[bucket], currency),
    former: formerOwedMinor === 0 ? null : money(formerOwedMinor, currency),
  };
}

function RollHeading({ owing }: { owing: boolean }) {
  return (
    <>
      <CardTitle className="flex items-center gap-2">
        <GraduationCapIcon aria-hidden="true" />
        {owing ? 'Students and what they owe' : 'Students by status'}
      </CardTitle>
      <CardDescription>
        {owing
          ? 'New intakes are part of Active. Nobody is deleted, so balances stay counted.'
          : 'New intakes are part of Active.'}
      </CardDescription>
    </>
  );
}

function RollColumns() {
  return (
    <div
      aria-hidden="true"
      className="flex items-baseline justify-between gap-3 px-3 pb-1 text-xs text-muted-foreground"
    >
      <span>Status</span>
      <span className="flex items-baseline gap-6">
        <span className={VALUE_WIDTH}>Students</span>
        <span className={OWED_WIDTH}>Owed</span>
      </span>
    </div>
  );
}

function FormerOwedNote({ amount }: { amount: string | null }) {
  if (amount === null) {
    return null;
  }
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      {amount} of what is owed is from students no longer at the school.
    </p>
  );
}

export function RollCard() {
  const api = useApi();
  const roll = useQuery(dashboardRollQueryOptions(api));
  const current = useQuery(currentTermQueryOptions(api));
  if (roll.isPending) {
    return <CardSkeleton rows={5} />;
  }
  if (roll.data === undefined) {
    return <ErrorMessage error={roll.error} />;
  }
  const owed = owedFigures(roll.data);
  const lines = rollLines(
    roll.data,
    current.data?.schoolYear?.name,
    owed?.of ?? NO_OWED_FIGURE
  );
  return (
    <Card>
      <CardHeader>
        <RollHeading owing={owed !== null} />
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/students">Students</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {owed === null ? null : <RollColumns />}
        <ul className="flex flex-col">
          {lines.map((line) => (
            <RollRow key={line.tab} line={line} />
          ))}
        </ul>
        <FormerOwedNote amount={owed?.former ?? null} />
      </CardContent>
    </Card>
  );
}

function campusSubline(campusNames: string[] | null): string {
  if (campusNames === null) {
    return 'Across all campuses';
  }
  return campusNames.length === 0
    ? 'No campus yet'
    : `${campusNames.join(', ')} campus`;
}

export function StudentsStat() {
  const roll = useQuery(dashboardRollQueryOptions(useApi()));
  if (roll.isPending) {
    return <StatSkeleton />;
  }
  if (roll.data === undefined) {
    return <ErrorMessage error={roll.error} />;
  }
  const { campusNames } = roll.data;
  return (
    <StatCard
      label="Students"
      value={roll.data.active}
      sub={campusSubline(campusNames)}
      to="/students"
    />
  );
}
