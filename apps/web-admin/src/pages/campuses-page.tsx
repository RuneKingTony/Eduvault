import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2Icon, InfoIcon, PlusIcon } from 'lucide-react';
import type { CampusSummary } from '@eduvault/api-contract';
import { Can, UserAvatar, usePermissions } from '@eduvault/auth-client';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ErrorMessage,
  PageSkeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { CampusDialog } from '../components/campus-dialog';
import { campusSummaryQueryOptions } from '../queries';

const INFO =
  'Each campus has its own staff, classes and students. Whoever adds a campus is added to it.';

export function describeCampuses(
  campuses: readonly CampusSummary[],
  scopeIsAll: boolean
): string {
  if (!scopeIsAll) {
    return `You belong to ${campuses.map((campus) => campus.name).join(', ')}`;
  }
  return `${campuses.length} campus${campuses.length === 1 ? '' : 'es'}`;
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}

function Principals({ campus }: { campus: CampusSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs text-muted-foreground">Principal</span>
      {campus.principals.length === 0 ? (
        <span className="text-muted-foreground">Not assigned</span>
      ) : (
        campus.principals.map((principal) => (
          <span key={principal.userId} className="flex items-center gap-1.5">
            <UserAvatar name={principal.name} className="size-6" />
            {principal.name}
          </span>
        ))
      )}
    </div>
  );
}

function CampusCard({
  campus,
  onEdit,
}: {
  campus: CampusSummary;
  onEdit: (campus: CampusSummary) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2Icon className="size-4 text-primary" />
          {campus.name}
        </CardTitle>
        {campus.address === null ? null : (
          <CardDescription>{campus.address}</CardDescription>
        )}
        <Can permission="team:update">
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Edit ${campus.name}`}
              onClick={() => {
                onEdit(campus);
              }}
            >
              Edit
            </Button>
          </CardAction>
        </Can>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Principals campus={campus} />
        <div className="flex gap-8">
          <Figure label="Classes" value={campus.counts.classes} />
          <Figure label="Students" value={campus.counts.students} />
          <Figure label="Staff" value={campus.counts.staff} />
        </div>
      </CardContent>
    </Card>
  );
}

function NewCampusButton({ onClick }: { onClick: () => void }) {
  return (
    <Can permission="team:create">
      <Button type="button" onClick={onClick}>
        <PlusIcon />
        New campus
      </Button>
    </Can>
  );
}

function NoCampuses({ onNew }: { onNew: () => void }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>No campuses yet</EmptyTitle>
        <EmptyDescription>
          Add the first campus to start adding classes and students.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <NewCampusButton onClick={onNew} />
      </EmptyContent>
    </Empty>
  );
}

function CampusesHeader({
  campuses,
  scopeIsAll,
  onNew,
}: {
  campuses: readonly CampusSummary[];
  scopeIsAll: boolean;
  onNew: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          Campuses
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About campuses"
                className="text-muted-foreground"
              >
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{INFO}</TooltipContent>
          </Tooltip>
        </h1>
        {campuses.length === 0 ? null : (
          <p className="text-sm text-muted-foreground">
            {describeCampuses(campuses, scopeIsAll)}
          </p>
        )}
      </div>
      <NewCampusButton onClick={onNew} />
    </header>
  );
}

function CampusGrid({
  campuses,
  onNew,
  onEdit,
}: {
  campuses: readonly CampusSummary[];
  onNew: () => void;
  onEdit: (campus: CampusSummary) => void;
}) {
  if (campuses.length === 0) {
    return <NoCampuses onNew={onNew} />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {campuses.map((campus) => (
        <CampusCard key={campus.id} campus={campus} onEdit={onEdit} />
      ))}
    </div>
  );
}

type DialogState = { campus?: CampusSummary } | null;

export function CampusesPage() {
  const api = useApi();
  const { campusScope } = usePermissions();
  const summary = useQuery(campusSummaryQueryOptions(api));
  const [dialog, setDialog] = useState<DialogState>(null);
  if (summary.isError) {
    return <ErrorMessage error={summary.error} />;
  }
  if (summary.data === undefined) {
    return <PageSkeleton rows={2} />;
  }
  const campuses = summary.data;
  const scopeIsAll = campusScope === 'all';
  return (
    <section className="flex flex-col gap-4">
      <CampusesHeader
        campuses={campuses}
        scopeIsAll={scopeIsAll}
        onNew={() => {
          setDialog({});
        }}
      />
      <CampusGrid
        campuses={campuses}
        onNew={() => {
          setDialog({});
        }}
        onEdit={(picked) => {
          setDialog({ campus: picked });
        }}
      />
      {scopeIsAll ? null : (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            You only see the campuses you work on.
          </AlertDescription>
        </Alert>
      )}
      {dialog === null ? null : (
        <CampusDialog
          key={dialog.campus?.id ?? 'new'}
          campus={dialog.campus}
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
        />
      )}
    </section>
  );
}
