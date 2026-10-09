import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BanIcon,
  EyeIcon,
  HistoryIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  ShieldIcon,
  UserCogIcon,
} from 'lucide-react';
import { ApiError, type PlatformSchool } from '@eduvault/api-contract';
import { UserAvatar } from '@eduvault/auth-client';
import { fmtTimestamp } from '@eduvault/shared';
import {
  Breadcrumb,
  BreadcrumbItem,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ErrorMessage,
  NotFoundState,
  PageSkeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@eduvault/ui';
import type { SchoolRef } from '../acting-store';
import { useApi } from '../api';
import { AuditTable } from '../components/audit-table';
import { TemporaryPasswordDialog } from '../components/created-school-dialog';
import {
  ReplaceOwnerDialog,
  type NewOwnerPassword,
} from '../components/replace-owner-dialog';
import { SchoolStatusDialog } from '../components/school-status-dialogs';
import { StatusBadge } from '../components/schools-table';
import {
  platformAuditQueryOptions,
  platformSchoolQueryOptions,
} from '../queries';

const RECENT_REQUESTS = 8;

const STATUS_ACTION = {
  active: {
    change: 'suspend',
    variant: 'destructive',
    Icon: BanIcon,
    label: 'Suspend school…',
  },
  suspended: {
    change: 'reactivate',
    variant: 'default',
    Icon: RefreshCwIcon,
    label: 'Reactivate…',
  },
} as const;

const ACTING_LINES = [
  ['Read-only by default', 'Every read and read-all permission, all campuses.'],
  [
    'Writes need a reason',
    'Give a reason, such as a ticket number, to make changes.',
  ],
  [
    'Everything is audited',
    'Actor, school, method, path, status, reason, time.',
  ],
] as const;

type Dialog = 'status' | 'owner' | null;

function OwnerCard({ school }: { school: PlatformSchool }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          Owner
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {school.owners.length === 0 ? (
          <span className="text-sm text-muted-foreground">No owner</span>
        ) : (
          school.owners.map((owner) => (
            <div key={owner.id} className="flex items-center gap-3">
              <UserAvatar name={owner.name} />
              <div className="flex flex-col leading-tight">
                <span className="font-medium">{owner.name}</span>
                <span className="text-sm text-muted-foreground">
                  {owner.email}
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ActingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldIcon className="size-4" />
          Acting in a school
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ACTING_LINES.map(([title, text]) => (
          <div key={title} className="flex flex-col leading-tight">
            <span className="font-medium">{title}</span>
            <span className="text-sm text-muted-foreground">{text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentRequests({ schoolId }: { schoolId: string }) {
  const api = useApi();
  const audit = useQuery(
    platformAuditQueryOptions(api, {
      schoolId,
      kind: 'acting',
      limit: RECENT_REQUESTS,
    })
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-4" />
          Recent acting requests
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ErrorMessage error={audit.error} />
        <AuditTable rows={audit.data?.items ?? []} showSchool={false} />
      </CardContent>
    </Card>
  );
}

function Actions({
  school,
  onAct,
  onOpen,
}: {
  school: PlatformSchool;
  onAct: () => void;
  onOpen: (dialog: Exclude<Dialog, null>) => void;
}) {
  const status = STATUS_ACTION[school.status];
  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" onClick={onAct}>
              <EyeIcon />
              Act in this school
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Opens web-admin read-only; every request is audited
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            <MoreHorizontalIcon />
            More actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              onOpen('owner');
            }}
          >
            <UserCogIcon />
            Replace owner…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={status.variant}
            onSelect={() => {
              onOpen('status');
            }}
          >
            <status.Icon />
            {status.label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Header({
  school,
  onAct,
  onOpen,
}: {
  school: PlatformSchool;
  onAct: () => void;
  onOpen: (dialog: Exclude<Dialog, null>) => void;
}) {
  const created = `created ${fmtTimestamp(school.createdAt)}`;
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{school.name}</h1>
          <StatusBadge status={school.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {school.city === null ? created : `${school.city} · ${created}`}
        </p>
      </div>
      <Actions school={school} onAct={onAct} onOpen={onOpen} />
    </header>
  );
}

function SchoolNotFound({ onBack }: { onBack: () => void }) {
  return (
    <NotFoundState
      title="School not found"
      description="We couldn’t find that school. It may have been moved, or it may belong to a campus or class you don’t look after."
    >
      <Button type="button" variant="outline" size="sm" onClick={onBack}>
        Go back
      </Button>
    </NotFoundState>
  );
}

function SchoolDialogs({
  school,
  dialog,
  onClose,
  onPassword,
}: {
  school: PlatformSchool;
  dialog: Dialog;
  onClose: () => void;
  onPassword: (password: NewOwnerPassword) => void;
}) {
  const change = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
  return (
    <>
      <SchoolStatusDialog
        school={school}
        change={STATUS_ACTION[school.status].change}
        open={dialog === 'status'}
        onOpenChange={change}
      />
      <ReplaceOwnerDialog
        school={school}
        open={dialog === 'owner'}
        onOpenChange={change}
        onPassword={onPassword}
      />
    </>
  );
}

function SchoolBody({
  school,
  onActInSchool,
  onBack,
}: {
  school: PlatformSchool;
  onActInSchool: (school: SchoolRef) => void;
  onBack: () => void;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [password, setPassword] = useState<NewOwnerPassword | null>(null);
  return (
    <section className="flex flex-col gap-5">
      <Breadcrumb aria-label="School">
        <BreadcrumbList>
          <BreadcrumbItem>
            <Button type="button" variant="link" size="sm" onClick={onBack}>
              Schools
            </Button>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{school.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Header
        school={school}
        onAct={() => {
          onActInSchool({ id: school.id, name: school.name });
        }}
        onOpen={setDialog}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <OwnerCard school={school} />
        <ActingCard />
      </div>
      <RecentRequests schoolId={school.id} />
      <SchoolDialogs
        school={school}
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
        onPassword={setPassword}
      />
      <TemporaryPasswordDialog
        open={password !== null}
        title={`New owner of ${password?.schoolName ?? ''}`}
        description="Give the new owner this temporary password. They choose their own at first sign-in. It won’t be shown again."
        email={password?.email ?? ''}
        password={password?.password ?? null}
        onDone={() => {
          setPassword(null);
        }}
      />
    </section>
  );
}

export function PlatformSchoolPage({
  schoolId,
  onActInSchool,
  onBack,
}: {
  schoolId: string;
  onActInSchool: (school: SchoolRef) => void;
  onBack: () => void;
}) {
  const api = useApi();
  const { data: school, error } = useQuery(
    platformSchoolQueryOptions(api, schoolId)
  );
  if (error instanceof ApiError && error.status === 404) {
    return <SchoolNotFound onBack={onBack} />;
  }
  if (school === undefined) {
    return error === null ? (
      <PageSkeleton rows={3} />
    ) : (
      <ErrorMessage error={error} />
    );
  }
  return (
    <SchoolBody school={school} onActInSchool={onActInSchool} onBack={onBack} />
  );
}
