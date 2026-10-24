import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EllipsisIcon,
  GraduationCapIcon,
  UserRoundPlusIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import type { CalendarCurrent, ClassDetail } from '@eduvault/api-contract';
import { Can, UserAvatar } from '@eduvault/auth-client';
import { countOf } from '@eduvault/shared';
import {
  ConfirmDialog,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  NumberedPager,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  BackButton,
  DetailNotFound,
  DetailPage,
} from '../components/detail-page';
import { AddClassTeacherDialog } from '../components/add-class-teacher-dialog';
import { ROLE_LABELS } from '../components/class-text';
import { GraduateClassDialog } from '../components/graduate-class-dialog';
import { ClassSubjectTeachers } from '../components/subjects/class-subject-teachers';
import {
  classQueryOptions,
  currentTermQueryOptions,
  invalidateClassTeachers,
  invalidateClasses,
} from '../queries';

const ROSTER_PAGE_SIZE = 10;

function useArchive(classRow: ClassDetail) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) =>
      api.classes.update({ params: { id: classRow.id }, body: { archived } }),
    onSuccess: async (_row, archived) => {
      await invalidateClasses(queryClient);
      toast.success(
        archived
          ? `${classRow.displayName} archived. It stays on file and can be restored.`
          : `${classRow.displayName} restored.`
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useRemoveTeacher(classRow: ClassDetail) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teacher: { userId: string; name: string }) =>
      api.classes.removeTeacher({
        params: { id: classRow.id, userId: teacher.userId },
      }),
    onSuccess: async (_removed, teacher) => {
      await invalidateClassTeachers(queryClient);
      toast.success(
        `${teacher.name} removed as class teacher of ${classRow.displayName}.`
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function ArchiveMenu({ classRow }: { classRow: ClassDetail }) {
  const archive = useArchive(classRow);
  const archived = classRow.retiredAt !== null;
  return (
    <Can permission="class:update">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Actions for ${classRow.displayName}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              archive.mutate(!archived);
            }}
          >
            {archived ? 'Restore class' : 'Archive class'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Can>
  );
}

function describeClass(classRow: ClassDetail, term: string | null): string {
  const students = countOf(classRow.studentCount, 'student', 'students');
  return [
    `${classRow.campus.name} campus`,
    students,
    term,
    classRow.isFinalYear ? 'final year' : null,
    classRow.retiredAt === null ? null : 'archived',
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

function AddTeacherButton({ onClick }: { onClick: () => void }) {
  return (
    <Can permission="class:assignTeacher">
      <Button type="button" variant="outline" size="sm" onClick={onClick}>
        <UserRoundPlusIcon />
        Add class teacher
      </Button>
    </Can>
  );
}

function TeacherRows({ classRow }: { classRow: ClassDetail }) {
  const remove = useRemoveTeacher(classRow);
  const [removing, setRemoving] = useState<
    ClassDetail['classTeachers'][number] | null
  >(null);
  return (
    <>
      <ul className="flex flex-col gap-2">
        {classRow.classTeachers.map((teacher) => (
          <li key={teacher.userId} className="flex items-center gap-3">
            <UserAvatar name={teacher.name} className="size-7" />
            <span className="flex-1 font-medium">{teacher.name}</span>
            <Badge variant={teacher.role === 'lead' ? 'default' : 'secondary'}>
              {ROLE_LABELS[teacher.role]}
            </Badge>
            <Can permission="class:assignTeacher">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${teacher.name}`}
                onClick={() => {
                  setRemoving(teacher);
                }}
              >
                <XIcon />
              </Button>
            </Can>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? 'teacher'} as class teacher?`}
        description={`They stop teaching ${classRow.displayName} as its class teacher. You can add them back later.`}
        tone="destructive"
        confirmLabel="Remove teacher"
        pending={remove.isPending}
        onConfirm={() => {
          if (removing !== null) {
            remove.mutate(removing, {
              onSettled: () => {
                setRemoving(null);
              },
            });
          }
        }}
        onCancel={() => {
          setRemoving(null);
        }}
      />
    </>
  );
}

function TeachersCard({
  classRow,
  onAdd,
}: {
  classRow: ClassDetail;
  onAdd: () => void;
}) {
  const archived = classRow.retiredAt !== null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-4 text-primary" />
          Teachers
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {classRow.classTeachers.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No class teacher yet</EmptyTitle>
              <EmptyDescription>
                Add a lead teacher so the class has someone responsible.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {archived ? null : <AddTeacherButton onClick={onAdd} />}
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Class teachers</p>
            <TeacherRows classRow={classRow} />
            {archived ? null : (
              <div>
                <AddTeacherButton onClick={onAdd} />
              </div>
            )}
          </>
        )}
        <ClassSubjectTeachers classId={classRow.id} />
      </CardContent>
    </Card>
  );
}

function RosterTable({ rows }: { rows: NonNullable<ClassDetail['roster']> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Adm. no.</TableHead>
          <TableHead>Electives</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.studentId}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="font-mono text-sm">
              {row.admissionNumber}
            </TableCell>
            <TableCell>
              {row.electives.length === 0 ? '—' : row.electives.join(', ')}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RosterCard({
  roster,
}: {
  roster: NonNullable<ClassDetail['roster']>;
}) {
  const [page, setPage] = useState(1);
  const shown = roster.slice(
    (page - 1) * ROSTER_PAGE_SIZE,
    page * ROSTER_PAGE_SIZE
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCapIcon className="size-4 text-primary" />
          Roster
          <Badge variant="secondary">{roster.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {roster.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Nothing here yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <RosterTable rows={shown} />
        )}
        {roster.length > ROSTER_PAGE_SIZE ? (
          <NumberedPager
            page={page}
            total={roster.length}
            pageSize={ROSTER_PAGE_SIZE}
            onPage={setPage}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ClassNotFound({ onBack }: { onBack: () => void }) {
  return (
    <DetailNotFound
      heading="Class not found"
      title="We couldn’t find that class"
      description="It may have been moved, or it may belong to a campus or class you don’t look after."
      back={<BackButton label="Go back" onBack={onBack} />}
    />
  );
}

interface GraduateHandlers {
  onOpenGraduated: () => void;
  onOpenStartYear: () => void;
}

function GraduateButton({
  classRow,
  onClick,
}: {
  classRow: ClassDetail;
  onClick: () => void;
}) {
  const hasRoster = (classRow.roster?.length ?? 0) > 0;
  if (!classRow.isFinalYear || !hasRoster) {
    return null;
  }
  return (
    <Can permission="student:archive">
      <Button type="button" variant="outline" onClick={onClick}>
        <GraduationCapIcon />
        Graduate class
      </Button>
    </Can>
  );
}

function ClassHeader({
  classRow,
  term,
  onBack,
  onGraduate,
}: {
  classRow: ClassDetail;
  term: string | null;
  onBack: () => void;
  onGraduate: () => void;
}) {
  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={onBack}>
                Classes
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{classRow.displayName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1>{classRow.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {describeClass(classRow, term)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GraduateButton classRow={classRow} onClick={onGraduate} />
          <ArchiveMenu classRow={classRow} />
        </div>
      </header>
    </>
  );
}

function ClassBody({
  classRow,
  term,
  current,
  onBack,
  ...graduateHandlers
}: GraduateHandlers & {
  classRow: ClassDetail;
  term: string | null;
  current: CalendarCurrent | undefined;
  onBack: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [graduating, setGraduating] = useState(false);
  return (
    <section className="flex flex-col gap-4">
      <ClassHeader
        classRow={classRow}
        term={term}
        onBack={onBack}
        onGraduate={() => {
          setGraduating(true);
        }}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <TeachersCard
          classRow={classRow}
          onAdd={() => {
            setAdding(true);
          }}
        />
        {classRow.roster === null ? null : (
          <RosterCard roster={classRow.roster} />
        )}
      </div>
      {adding ? (
        <AddClassTeacherDialog
          classRow={classRow}
          open
          onOpenChange={setAdding}
        />
      ) : null}
      {graduating && classRow.roster !== null ? (
        <GraduateClassDialog
          classRow={classRow}
          roster={classRow.roster}
          current={current}
          {...graduateHandlers}
          onClose={() => {
            setGraduating(false);
          }}
        />
      ) : null}
    </section>
  );
}

export function ClassPage({
  classId,
  onBack,
  ...graduateHandlers
}: GraduateHandlers & {
  classId: string;
  onBack: () => void;
}) {
  const api = useApi();
  const classRow = useQuery(classQueryOptions(api, classId));
  const current = useQuery(currentTermQueryOptions(api));
  return (
    <DetailPage
      queries={[classRow]}
      notFound={<ClassNotFound onBack={onBack} />}
    >
      {([loaded]) => (
        <ClassBody
          classRow={loaded}
          term={current.data?.term?.name ?? null}
          current={current.data}
          onBack={onBack}
          {...graduateHandlers}
        />
      )}
    </DetailPage>
  );
}
