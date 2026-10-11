import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, SchoolIcon } from 'lucide-react';
import type { MyClass } from '@eduvault/api-contract';
import {
  Badge,
  Button,
  Card,
  CardAction,
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
import { countOf } from '@eduvault/shared';
import { useApi } from '../../api';
import { myClassesQueryOptions } from '../../queries';
import { PersonAvatar } from '../person-avatar';
import { CardSkeleton } from './card-states';

function ClassRow({ row }: { row: MyClass }) {
  const more = row.studentCount - row.sampleStudents.length;
  return (
    <li>
      <Link
        to="/classes/$classId"
        params={{ classId: row.armId }}
        className="flex items-center gap-3 rounded-md p-3 hover:bg-muted/50"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 font-medium">
            {row.name}
            {row.isClassTeacher ? <Badge>Class teacher</Badge> : null}
          </span>
          <span className="text-sm text-muted-foreground">
            {countOf(row.studentCount, 'student', 'students')} ·{' '}
            {row.campusName} campus
          </span>
        </span>
        <span className="hidden items-center gap-1 md:flex">
          {row.sampleStudents.map((student) => (
            <PersonAvatar key={student.id} name={student.name} />
          ))}
          {more > 0 ? (
            <span className="text-sm text-muted-foreground">+{more}</span>
          ) : null}
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-4" />
      </Link>
    </li>
  );
}

export function MyClassesCard() {
  const classes = useQuery(myClassesQueryOptions(useApi()));
  if (classes.isPending) {
    return <CardSkeleton />;
  }
  if (classes.data === undefined) {
    return <ErrorMessage error={classes.error} />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SchoolIcon aria-hidden="true" />
          My classes
          <Badge variant="secondary">{classes.data.length}</Badge>
        </CardTitle>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/classes">All classes</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {classes.data.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SchoolIcon />
              </EmptyMedia>
              <EmptyTitle>No classes yet</EmptyTitle>
              <EmptyDescription>
                Classes you teach show up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col">
            {classes.data.map((row) => (
              <ClassRow key={row.armId} row={row} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
