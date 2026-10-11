import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { GraduationCapIcon } from 'lucide-react';
import type { DashboardRoll, StudentTab } from '@eduvault/api-contract';
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

interface RollLine {
  tab: StudentTab;
  label: string;
  sub: string;
  value: number;
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
        <span className="text-lg font-semibold">{line.value}</span>
      </Link>
    </li>
  );
}

function rollLines(data: DashboardRoll, year: string | undefined): RollLine[] {
  return [
    {
      tab: 'active',
      label: 'Active',
      sub: 'On the roll and billed',
      value: data.active,
    },
    {
      tab: 'new',
      label: 'New intakes',
      sub: year === undefined ? 'Admitted this year' : `Admitted in ${year}`,
      value: data.newIntakes,
      indent: true,
    },
    {
      tab: 'inactive',
      label: 'Inactive',
      sub: `${data.dueLeft} due to be marked Left`,
      value: data.inactive,
    },
    {
      tab: 'left',
      label: 'Left',
      sub: `${data.leftThisTerm} this term`,
      value: data.left,
    },
    {
      tab: 'graduated',
      label: 'Graduated',
      sub: 'Finished the final class',
      value: data.graduated,
    },
  ];
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
  const lines = rollLines(roll.data, current.data?.schoolYear?.name);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCapIcon aria-hidden="true" />
          Students by status
        </CardTitle>
        <CardDescription>New intakes are part of Active.</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/students">Students</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {lines.map((line) => (
            <RollRow key={line.tab} line={line} />
          ))}
        </ul>
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
