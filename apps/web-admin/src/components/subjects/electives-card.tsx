import { ChevronDownIcon, ListChecksIcon, UserPlusIcon } from 'lucide-react';
import { Can } from '@eduvault/auth-client';
import type { ElectiveList, LevelSubject } from '@eduvault/api-contract';
import {
  AvatarGroup,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { PersonAvatar } from '../student-bits';
import type { ElectiveTarget } from './elective-takers-sheet';

type Elective = ElectiveList['electives'][number];

function TakerAvatars({
  studentIds,
  students,
}: {
  studentIds: readonly string[];
  students: ReadonlyMap<string, ElectiveList['students'][number]>;
}) {
  if (studentIds.length === 0) {
    return <span className="text-sm text-muted-foreground">Nobody yet</span>;
  }
  return (
    <AvatarGroup>
      {studentIds.map((id) => {
        const name = students.get(id)?.name ?? '';
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <span>
                <PersonAvatar name={name} className="size-7" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        );
      })}
    </AvatarGroup>
  );
}

function ElectiveLine({
  elective,
  name,
  students,
  onChoose,
}: {
  elective: Elective;
  name: string;
  students: ReadonlyMap<string, ElectiveList['students'][number]>;
  onChoose: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-t px-4 py-2 first:border-t-0">
      <span className="w-40 text-sm font-medium">{name}</span>
      <div className="flex min-w-0 flex-1 items-center">
        <TakerAvatars studentIds={elective.studentIds} students={students} />
      </div>
      <Can permission="subject:update">
        <Button type="button" variant="ghost" size="xs" onClick={onChoose}>
          <UserPlusIcon />
          Choose students
        </Button>
      </Can>
    </li>
  );
}

const toTarget = (
  elective: Elective,
  name: string,
  rows: readonly LevelSubject[]
): ElectiveTarget => ({
  subjectId: elective.subjectId,
  name,
  takerIds: elective.studentIds,
  electiveLevelIds: new Set(
    rows
      .filter(
        (row) => row.subjectId === elective.subjectId && row.kind === 'elective'
      )
      .map((row) => row.classLevelId)
  ),
});

function ElectivesTrigger({ count }: { count: number }) {
  return (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
      >
        <ListChecksIcon aria-hidden="true" className="size-4" />
        <CardTitle className="flex-1">Electives taken this session</CardTitle>
        <Badge variant="secondary">{count}</Badge>
        <ChevronDownIcon aria-hidden="true" className="size-4" />
      </button>
    </CollapsibleTrigger>
  );
}

export function ElectivesCard({
  list,
  rows,
  onChoose,
}: {
  list: ElectiveList;
  rows: readonly LevelSubject[];
  onChoose: (target: ElectiveTarget) => void;
}) {
  const students = new Map(
    list.students.map((student) => [student.id, student])
  );
  const names = new Map(rows.map((row) => [row.subjectId, row.subjectName]));
  return (
    <Collapsible defaultOpen asChild>
      <Card>
        <CardHeader>
          <ElectivesTrigger count={list.electives.length} />
          <CardDescription>
            Electives are taken only by the students who choose them.
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="px-0">
            {list.electives.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">
                No electives.
              </p>
            ) : (
              <ul>
                {list.electives.map((elective) => {
                  const name = names.get(elective.subjectId) ?? '';
                  return (
                    <ElectiveLine
                      key={elective.subjectId}
                      elective={elective}
                      name={name}
                      students={students}
                      onChoose={() => {
                        onChoose(toTarget(elective, name, rows));
                      }}
                    />
                  );
                })}
              </ul>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
