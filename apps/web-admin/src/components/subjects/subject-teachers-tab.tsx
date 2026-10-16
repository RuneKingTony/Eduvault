import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  CopyIcon,
  SchoolIcon,
  UserRoundPlusIcon,
} from 'lucide-react';
import type {
  SubjectTeacherArm,
  SubjectTeacherRow,
} from '@eduvault/api-contract';
import { Can, UserAvatar, meQueryOptions } from '@eduvault/auth-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  PageSkeleton,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { subjectTeachersQueryOptions } from '../../queries';
import {
  AssignSubjectDialog,
  type AssignTarget,
} from './assign-subject-dialog';
import { CopyTeachersDialog } from './copy-teachers-dialog';
import { armCountLabel, teachesIn } from './subject-model';

function TeacherCell({
  row,
  viewer,
}: {
  row: SubjectTeacherRow;
  viewer: string | undefined;
}) {
  if (row.teacher === null) {
    return <span className="text-muted-foreground">Unassigned</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <UserAvatar name={row.teacher.name} className="size-6" />
      {row.teacher.name}
      {row.teacher.userId === viewer ? <Badge>You</Badge> : null}
    </span>
  );
}

function SubjectLine({
  row,
  viewer,
  onAssign,
}: {
  row: SubjectTeacherRow;
  viewer: string | undefined;
  onAssign: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>
        <TeacherCell row={row} viewer={viewer} />
      </TableCell>
      <TableCell className="text-right">
        <Can permission="class:assignTeacher">
          <Button type="button" variant="ghost" size="xs" onClick={onAssign}>
            <UserRoundPlusIcon />
            {row.teacher === null ? 'Assign' : 'Change'}
          </Button>
        </Can>
      </TableCell>
    </TableRow>
  );
}

function ArmCard({
  arm,
  viewer,
  defaultOpen,
  onAssign,
}: {
  arm: SubjectTeacherArm;
  viewer: string | undefined;
  defaultOpen: boolean;
  onAssign: (target: AssignTarget) => void;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} asChild>
      <Card>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
            >
              <SchoolIcon aria-hidden="true" className="size-4" />
              <CardTitle className="flex-1">
                {arm.displayName} · {arm.campus.name}
              </CardTitle>
              <Badge variant="secondary">{armCountLabel(arm)}</Badge>
              <ChevronDownIcon aria-hidden="true" className="size-4" />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="px-0">
            <Table>
              <TableBody>
                {arm.subjects.map((row) => (
                  <SubjectLine
                    key={row.subjectId}
                    row={row}
                    viewer={viewer}
                    onAssign={() => {
                      onAssign({ arm, row });
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function NoClasses() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SchoolIcon />
        </EmptyMedia>
        <EmptyTitle>No classes assigned to you</EmptyTitle>
        <EmptyDescription>
          Classes appear here once you are named as a subject teacher or class
          teacher.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function SubjectTeachersTab() {
  const api = useApi();
  const teachers = useQuery(subjectTeachersQueryOptions(api));
  const me = useQuery(meQueryOptions(api));
  const [target, setTarget] = useState<AssignTarget | null>(null);
  const [copying, setCopying] = useState(false);
  if (teachers.isPending) {
    return <PageSkeleton />;
  }
  if (teachers.data === undefined) {
    return <ErrorMessage error={teachers.error} />;
  }
  const viewer = me.data?.user.id;
  const { arms, copyFrom, term } = teachers.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {term === null ? 'No current term' : term.name}
        </p>
        {copyFrom === null ? null : (
          <Can permission="class:assignTeacher">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCopying(true);
              }}
            >
              <CopyIcon />
              Copy from last term
            </Button>
          </Can>
        )}
      </div>
      {arms.length === 0 ? (
        <NoClasses />
      ) : (
        arms.map((arm, index) => (
          <ArmCard
            key={arm.classId}
            arm={arm}
            viewer={viewer}
            defaultOpen={index === 0 || teachesIn(arm, viewer)}
            onAssign={setTarget}
          />
        ))
      )}
      <AssignSubjectDialog
        target={target}
        termName={term?.name}
        onClose={() => {
          setTarget(null);
        }}
      />
      <CopyTeachersDialog open={copying} onOpenChange={setCopying} />
    </div>
  );
}
