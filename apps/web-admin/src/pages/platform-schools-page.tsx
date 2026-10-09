import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InfoIcon, PlusIcon, SchoolIcon } from 'lucide-react';
import type {
  CreateSchoolResult,
  PlatformSchool,
} from '@eduvault/api-contract';
import { fmtDate, initials } from '@eduvault/shared';
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  SchoolCrest,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  ErrorMessage,
} from '@eduvault/ui';
import { useApi } from '../api';
import { CreateSchoolSheet } from '../components/create-school-sheet';
import { CreatedSchoolDialog } from '../components/created-school-dialog';
import { platformSchoolsQueryOptions } from '../queries';

const INFO = 'Only a super admin creates schools.';

function SchoolRow({ school }: { school: PlatformSchool }) {
  const [owner] = school.owners;
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <SchoolCrest name={school.name} initials={initials(school.name)} />
          <div className="flex flex-col">
            <span className="font-medium">{school.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {school.slug}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {owner === undefined ? (
          '—'
        ) : (
          <div className="flex flex-col">
            <span>{owner.name}</span>
            <span className="text-xs text-muted-foreground">{owner.email}</span>
          </div>
        )}
      </TableCell>
      <TableCell>{school.city ?? '—'}</TableCell>
      <TableCell>{fmtDate(school.createdAt)}</TableCell>
    </TableRow>
  );
}

function SchoolsTable({ items }: { items: PlatformSchool[] }) {
  if (items.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SchoolIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>Create the first school to begin.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>School</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>City</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((school) => (
          <SchoolRow key={school.id} school={school} />
        ))}
      </TableBody>
    </Table>
  );
}

export function PlatformSchoolsPage() {
  const api = useApi();
  const schools = useQuery(platformSchoolsQueryOptions(api));
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateSchoolResult | null>(null);
  const items = schools.data?.items ?? [];

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Schools</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={INFO}
                  >
                    <InfoIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{INFO}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? 'school' : 'schools'} on
            Eduvault
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setCreating(true);
          }}
        >
          <PlusIcon />
          Create school
        </Button>
      </header>
      <ErrorMessage error={schools.error} />
      <SchoolsTable items={items} />
      <CreateSchoolSheet
        open={creating}
        onOpenChange={setCreating}
        onCreated={setCreated}
      />
      <CreatedSchoolDialog
        result={created}
        onDone={() => {
          setCreated(null);
        }}
      />
    </section>
  );
}
