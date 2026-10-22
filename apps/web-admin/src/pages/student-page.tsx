import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  HistoryIcon,
  KeyRoundIcon,
  PencilIcon,
  UserIcon,
  UsersRoundIcon,
} from 'lucide-react';
import type {
  LoginCredential,
  StudentDetail,
  StudentTab,
} from '@eduvault/api-contract';
import { Can, useCanAny } from '@eduvault/auth-client';
import { FINANCE_READ_GATE, type Gate } from '@eduvault/policy';
import { fmtDate } from '@eduvault/shared';
import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  BackButton,
  DetailNotFound,
  DetailPage,
} from '../components/detail-page';
import { AddGuardianButton, GuardianLines } from '../components/guardian-lines';
import type { GuardianAction } from '../components/guardian-actions';
import { GuardianDialogs } from '../components/guardian-dialogs';
import { LoginsDialog } from '../components/logins-dialog';
import { useBackInSchool } from '../components/student-actions';
import { LifecycleCallout } from '../components/student-callout';
import { StatusBadges, nameOf } from '../components/student-bits';
import { StudentFeesTab } from '../components/student-fees-tab';
import {
  StudentLifecycleDialog,
  type LifecycleDialog,
} from '../components/student-lifecycle-dialogs';
import type { StudentAction } from '../components/student-lifecycle-model';
import {
  EditStudentDialog,
  ResetStudentLoginDialog,
} from '../components/student-detail-dialogs';
import { StudentMenu, useMenuItems } from '../components/student-menu';
import { StatementButton } from '../components/student-statement-button';
import { studentQueryOptions } from '../queries';

interface StudentPageProps {
  studentId: string;
  schoolName: string;
  logins?: LoginCredential[];
  initialDialog?: LifecycleDialog;
  tab?: PageTab;
  onTabChange: (tab: PageTab | undefined) => void;
  onDialogClosed?: () => void;
  onOpenTab: (tab: StudentTab) => void;
  onBack: () => void;
}

type PageTab = 'fees';

const FEES_TAB_GATE = [
  ...FINANCE_READ_GATE,
  'feeLine:read',
] as const satisfies Gate;

interface Issued {
  logins: LoginCredential[];
  title?: string;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function PortalLogin({ student }: { student: StudentDetail }) {
  if (student.portalLogin === null) {
    return <span className="text-muted-foreground">Not created</span>;
  }
  const { username, active } = student.portalLogin;
  return (
    <span className="flex items-center gap-2">
      <code className="font-mono">{username}</code>
      {active ? (
        <Badge variant="success">Active</Badge>
      ) : (
        <span className="text-muted-foreground">Closed</span>
      )}
    </span>
  );
}

function ExitRow({ student }: { student: StudentDetail }) {
  const { exit } = student;
  if (exit === null) {
    return null;
  }
  const by =
    student.archivedBy === null ? '' : ` by ${student.archivedBy.name}`;
  return (
    <Row label={exit.kind === 'left' ? 'Left' : 'Graduated'}>
      {fmtDate(exit.on)} · {exit.reason}
      {exit.note === null ? '' : `: ${exit.note}`} · recorded{by} on{' '}
      {fmtDate(exit.recordedOn)}
    </Row>
  );
}

type DetailAction = 'edit' | 'reset-login';

function ProfileActions({
  student,
  onAction,
}: {
  student: StudentDetail;
  onAction: (action: DetailAction) => void;
}) {
  if (student.exit !== null) {
    return null;
  }
  return (
    <Can permission="student:update">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onAction('edit');
          }}
        >
          <PencilIcon />
          Edit details
        </Button>
        {student.portalLogin?.active === true ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onAction('reset-login');
            }}
          >
            <KeyRoundIcon />
            Reset login
          </Button>
        ) : null}
      </div>
    </Can>
  );
}

function ProfileCard({
  student,
  onAction,
}: {
  student: StudentDetail;
  onAction: (action: DetailAction) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="size-4 text-primary" />
          Profile
        </CardTitle>
        <CardAction>
          <ProfileActions student={student} onAction={onAction} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          <Row label="Admission no.">
            <code className="font-mono">{student.admissionNumber}</code>
          </Row>
          <Row label="Date of birth">{fmtDate(student.dateOfBirth)}</Row>
          <Row label="Admitted">{fmtDate(student.admittedOn)}</Row>
          <Row label="Home campus">{student.homeCampus.name}</Row>
          <Row label="Portal login">
            <PortalLogin student={student} />
          </Row>
          {student.notSeenSince === null ? null : (
            <Row label="Not seen since">
              {fmtDate(student.notSeenSince)}
              {student.notSeenBy === null
                ? ''
                : ` · marked by ${student.notSeenBy.name}`}
              {student.notSeenNote === null ? null : (
                <span className="block text-muted-foreground">
                  {student.notSeenNote}
                </span>
              )}
            </Row>
          )}
          <ExitRow student={student} />
        </dl>
      </CardContent>
    </Card>
  );
}

function GuardiansCard({
  student,
  onAction,
}: {
  student: StudentDetail;
  onAction: (action: GuardianAction) => void;
}) {
  const ref = {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    onRoll: student.exit === null,
  };
  const linked = student.guardians ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRoundIcon className="size-4 text-primary" />
          Guardians
        </CardTitle>
        <CardAction>
          <AddGuardianButton student={ref} onAction={onAction} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {linked.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersRoundIcon />
              </EmptyMedia>
              <EmptyTitle>No guardian linked</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <GuardianLines student={ref} withMenu onAction={onAction} />
        )}
      </CardContent>
    </Card>
  );
}

function HistoryTable({ student }: { student: StudentDetail }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Session</TableHead>
          <TableHead>Level</TableHead>
          <TableHead>Class each term</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {student.history.map((year) => (
          <TableRow key={year.sessionId}>
            <TableCell>{year.sessionName}</TableCell>
            <TableCell>{year.levelName}</TableCell>
            <TableCell>
              {year.placements.map((placement) => (
                <div key={placement.termName}>
                  {placement.termName}: <strong>{placement.className}</strong>,{' '}
                  {placement.campusName}
                </div>
              ))}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="capitalize">
                  {year.status}
                </Badge>
                {year.isNew ? <Badge>New student</Badge> : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HistoryCard({ student }: { student: StudentDetail }) {
  return (
    <Collapsible defaultOpen asChild>
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4 text-primary" />
            Enrolment and placement history
          </CardTitle>
          <CardDescription>
            The level and class for each school year and term.
          </CardDescription>
          <CardAction>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Toggle history"
              >
                <ChevronDownIcon />
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="p-0">
            <HistoryTable student={student} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function StudentHeader({
  student,
  onBack,
  actions,
}: {
  student: StudentDetail;
  onBack: () => void;
  actions: React.ReactNode;
}) {
  const where =
    student.currentPlacement === null
      ? 'No class this term'
      : `${student.currentPlacement.className}, ${student.effectiveCampus.name}`;
  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={onBack}>
                Students
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{nameOf(student)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2">
            {nameOf(student)}
            <StatusBadges row={student} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {student.admissionNumber} · {where}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatementButton studentId={student.id} />
          {actions}
        </div>
      </header>
    </>
  );
}

interface BodyProps {
  student: StudentDetail;
  schoolName: string;
  initialDialog?: LifecycleDialog;
  tab?: PageTab;
  onTabChange: (tab: PageTab | undefined) => void;
  onDialogClosed?: () => void;
  onOpenTab: (tab: StudentTab) => void;
  onBack: () => void;
  onIssued: (issued: Issued) => void;
}

function useLifecycle(props: BodyProps) {
  const { student } = props;
  const items = useMenuItems(student);
  const [dialog, setDialog] = useState<LifecycleDialog | null>(
    props.initialDialog ?? null
  );
  const back = useBackInSchool(student);
  const open = (action: StudentAction) => {
    if (action === 'back') {
      back.mutate();
    } else {
      setDialog(action);
    }
  };
  const close = () => {
    setDialog(null);
    props.onDialogClosed?.();
  };
  const allowed = items.some((item) => item.action === dialog);
  return { items, open, close, dialog: allowed ? dialog : null };
}

function DetailDialog({
  action,
  student,
  onClose,
  onIssued,
}: {
  action: DetailAction | null;
  student: StudentDetail;
  onClose: () => void;
  onIssued: (issued: Issued) => void;
}) {
  if (action === 'edit') {
    return <EditStudentDialog student={student} onClose={onClose} />;
  }
  if (action === 'reset-login') {
    return (
      <ResetStudentLoginDialog
        student={student}
        onClose={onClose}
        onIssued={(logins) => {
          onIssued({ logins, title: `New login for ${nameOf(student)}` });
        }}
      />
    );
  }
  return null;
}

function Overview({
  student,
  onDetailAction,
  onGuardianAction,
}: {
  student: StudentDetail;
  onDetailAction: (action: DetailAction) => void;
  onGuardianAction: (action: GuardianAction) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ProfileCard student={student} onAction={onDetailAction} />
      <Can permission="guardian:read">
        <GuardiansCard student={student} onAction={onGuardianAction} />
      </Can>
      <HistoryCard student={student} />
    </div>
  );
}

function StudentTabs({
  student,
  tab,
  onTabChange,
  overview,
}: {
  student: StudentDetail;
  tab?: PageTab;
  onTabChange: (tab: PageTab | undefined) => void;
  overview: ReactNode;
}) {
  const canSeeFees = useCanAny(FEES_TAB_GATE);
  if (!canSeeFees) {
    return <>{overview}</>;
  }
  return (
    <Tabs
      value={tab ?? 'overview'}
      onValueChange={(next) => {
        onTabChange(next === 'fees' ? 'fees' : undefined);
      }}
    >
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="fees">Fees</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="fees">
        <StudentFeesTab studentId={student.id} firstName={student.firstName} />
      </TabsContent>
    </Tabs>
  );
}

function StudentBody(props: BodyProps) {
  const { student } = props;
  const [action, setAction] = useState<GuardianAction | null>(null);
  const [detailAction, setDetailAction] = useState<DetailAction | null>(null);
  const lifecycle = useLifecycle(props);
  return (
    <section className="flex flex-col gap-4">
      <StudentHeader
        student={student}
        onBack={props.onBack}
        actions={
          <StudentMenu items={lifecycle.items} onAction={lifecycle.open} />
        }
      />
      <LifecycleCallout
        student={student}
        onRecordLeaving={() => {
          lifecycle.open('leave');
        }}
      />
      <StudentTabs
        student={student}
        tab={props.tab}
        onTabChange={props.onTabChange}
        overview={
          <Overview
            student={student}
            onDetailAction={setDetailAction}
            onGuardianAction={setAction}
          />
        }
      />
      <GuardianDialogs
        action={action}
        schoolName={props.schoolName}
        onAction={setAction}
      />
      <DetailDialog
        action={detailAction}
        student={student}
        onClose={() => {
          setDetailAction(null);
        }}
        onIssued={props.onIssued}
      />
      {lifecycle.dialog === null ? null : (
        <StudentLifecycleDialog
          dialog={lifecycle.dialog}
          student={student}
          onClose={lifecycle.close}
          onOpenTab={props.onOpenTab}
        />
      )}
    </section>
  );
}

function StudentNotFound({ onBack }: { onBack: () => void }) {
  return (
    <DetailNotFound
      heading="Student not found"
      title="We couldn’t find that student"
      description="It may have been moved, or it may belong to a campus or class you don’t look after."
      back={<BackButton label="Go back" onBack={onBack} />}
    />
  );
}

export function StudentPage(props: StudentPageProps) {
  const api = useApi();
  const student = useQuery(studentQueryOptions(api, props.studentId));
  const [issued, setIssued] = useState<Issued | null>(
    props.logins === undefined ? null : { logins: props.logins }
  );
  return (
    <DetailPage
      queries={[student]}
      notFound={<StudentNotFound onBack={props.onBack} />}
    >
      {([loaded]) => (
        <>
          <StudentBody
            student={loaded}
            schoolName={props.schoolName}
            initialDialog={props.initialDialog}
            tab={props.tab}
            onTabChange={props.onTabChange}
            onDialogClosed={props.onDialogClosed}
            onOpenTab={props.onOpenTab}
            onBack={props.onBack}
            onIssued={setIssued}
          />
          <LoginsDialog
            open={issued !== null}
            {...(issued?.title === undefined ? {} : { title: issued.title })}
            studentFirstName={loaded.firstName}
            logins={issued?.logins ?? []}
            schoolName={props.schoolName}
            onDone={() => {
              setIssued(null);
            }}
          />
        </>
      )}
    </DetailPage>
  );
}
