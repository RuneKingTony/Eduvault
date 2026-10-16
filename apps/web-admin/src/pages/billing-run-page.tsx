import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BanIcon,
  EllipsisIcon,
  SendIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { ApiError, type BillingRun } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { money } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorMessage,
  NotFoundState,
  PageSkeleton,
} from '@eduvault/ui';
import { useApi } from '../api';
import { CancelRoundDialog } from '../components/billing/cancel-round-dialog';
import { chargesCount } from '../components/billing/billing-text';
import { RoundChargesCard } from '../components/billing/round-charges-card';
import { RoundStepper } from '../components/billing/round-stepper';
import { SendRoundDialog } from '../components/billing/send-round-dialog';
import { StatusBadge } from '../components/billing/status-badge';
import { billingRunQueryOptions } from '../queries';

function Crumbs({ last, onBack }: { last: string; onBack: () => void }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <button type="button" onClick={onBack}>
              Charge students
            </button>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{last}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function RunNotFound({ onBack }: { onBack: () => void }) {
  return (
    <section className="flex flex-col gap-4">
      <Crumbs last="Not found" onBack={onBack} />
      <h1>Not found</h1>
      <NotFoundState
        title="No charge round here"
        description="It may have been moved, or it may belong to a campus you don’t look after."
      >
        <Button type="button" variant="outline" onClick={onBack}>
          Back to charge students
        </Button>
      </NotFoundState>
    </section>
  );
}

type Dialogs = 'send' | 'cancel' | null;

function Actions({
  run,
  onOpen,
}: {
  run: BillingRun;
  onOpen: (dialog: Exclude<Dialogs, null>) => void;
}) {
  if (run.status !== 'draft') {
    return null;
  }
  return (
    <Can permission="invoice:bill">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={() => {
            onOpen('send');
          }}
        >
          <SendIcon />
          Send charges
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Actions for ${run.number}`}
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                onOpen('cancel');
              }}
            >
              <BanIcon />
              Cancel these charges
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Can>
  );
}

function Notices({ run }: { run: BillingRun }) {
  if (run.status === 'cancelled') {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertDescription>
          This round was cancelled, so these students can be charged again.
        </AlertDescription>
      </Alert>
    );
  }
  return run.feesChangedSincePrepared ? (
    <Alert>
      <TriangleAlertIcon />
      <AlertDescription>
        Fees changed after these charges were prepared. Cancel and prepare again
        to use the new amounts.
      </AlertDescription>
    </Alert>
  ) : null;
}

function RunBody({
  run,
  page,
  onPage,
  onBack,
}: {
  run: BillingRun;
  page: number;
  onPage: (page: number) => void;
  onBack: () => void;
}) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => {
    setDialog(null);
  };
  return (
    <section className="flex flex-col gap-4">
      <Crumbs last={run.number} onBack={onBack} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2">
            Charges {run.number}
            <StatusBadge status={run.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {[
              run.termName,
              run.scopeLabel,
              run.createdBy === null ? null : `created by ${run.createdBy}`,
            ]
              .filter((part): part is string => part !== null)
              .join(' · ')}
          </p>
        </div>
        <Actions run={run} onOpen={setDialog} />
      </header>
      <Notices run={run} />
      {run.status === 'cancelled' ? null : <RoundStepper status={run.status} />}
      <p className="text-sm text-muted-foreground">
        {chargesCount(run.chargeCount)} · {money(run.totalMinor, run.currency)}{' '}
        in total
      </p>
      <RoundChargesCard run={run} page={page} onPage={onPage} />
      <SendRoundDialog run={run} open={dialog === 'send'} onClose={close} />
      <CancelRoundDialog run={run} open={dialog === 'cancel'} onClose={close} />
    </section>
  );
}

export function BillingRunPage({
  runId,
  page,
  onPage,
  onBack,
}: {
  runId: string;
  page: number;
  onPage: (page: number) => void;
  onBack: () => void;
}) {
  const run = useQuery(billingRunQueryOptions(useApi(), runId, page));
  if (run.error instanceof ApiError && run.error.status === 404) {
    return <RunNotFound onBack={onBack} />;
  }
  if (run.isError) {
    return <ErrorMessage error={run.error} />;
  }
  if (run.data === undefined) {
    return <PageSkeleton rows={2} />;
  }
  return <RunBody run={run.data} page={page} onPage={onPage} onBack={onBack} />;
}
