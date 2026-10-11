import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  CheckCheckIcon,
  CircleAlertIcon,
  ListChecksIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { dashboardTasksQueryOptions } from '../../queries';
import { CardSkeleton } from './card-states';
import { TargetLink } from './target-link';
import { taskRow, type TaskRow } from './tasks-model';

function TaskItem({ row }: { row: TaskRow }) {
  const Icon = row.tone === 'danger' ? TriangleAlertIcon : CircleAlertIcon;
  const tone = row.tone === 'danger' ? 'text-destructive' : 'text-primary';
  return (
    <li className="relative flex items-center gap-3 rounded-md p-3 hover:bg-muted/50">
      <Icon className={`size-5 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{row.title}</p>
        <p className="text-sm text-muted-foreground">{row.subline}</p>
      </div>
      {row.extra === null ? null : (
        <Button asChild size="sm" className="relative z-10">
          <TargetLink dest={row.extra.target}>{row.extra.label}</TargetLink>
        </Button>
      )}
      <Button asChild size="sm" variant="outline">
        <TargetLink
          dest={row.action.target}
          className="after:absolute after:inset-0"
        >
          {row.action.label}
          <ArrowRightIcon aria-hidden="true" />
        </TargetLink>
      </Button>
    </li>
  );
}

function AllCaughtUp({ variant }: { variant: 'staff' | 'teacher' }) {
  if (variant === 'teacher') {
    return (
      <Alert>
        <CheckCheckIcon />
        <AlertDescription>
          <strong>All caught up.</strong> Nothing needs you today.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Card>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCheckIcon className="text-success" />
            </EmptyMedia>
            <EmptyTitle>All caught up</EmptyTitle>
            <EmptyDescription>
              Nothing needs you right now. New requests and reminders show up
              here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

export function TasksCard({
  variant = 'staff',
}: {
  variant?: 'staff' | 'teacher';
}) {
  const tasks = useQuery(dashboardTasksQueryOptions(useApi()));
  if (tasks.isPending) {
    return <CardSkeleton />;
  }
  if (tasks.data === undefined) {
    return <ErrorMessage error={tasks.error} />;
  }
  if (tasks.data.length === 0) {
    return <AllCaughtUp variant={variant} />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecksIcon aria-hidden="true" />
          Needs you today
          <Badge variant="secondary">{tasks.data.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {tasks.data.map((task) => {
            const row = taskRow(task);
            return <TaskItem key={row.key} row={row} />;
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
