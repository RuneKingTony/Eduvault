import { SchoolIcon } from 'lucide-react';
import type { PlatformSchool } from '@eduvault/api-contract';
import { UserAvatar } from '@eduvault/auth-client';
import { fmtTimestamp, initials } from '@eduvault/shared';
import {
  Badge,
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
} from '@eduvault/ui';

export function StatusBadge({ status }: { status: PlatformSchool['status'] }) {
  return status === 'active' ? (
    <Badge variant="success">Active</Badge>
  ) : (
    <Badge variant="warning">Suspended</Badge>
  );
}

function OwnerCell({ owner }: { owner: PlatformSchool['owners'][number] }) {
  return (
    <div className="flex items-center gap-2">
      <UserAvatar name={owner.name} />
      <div className="flex flex-col leading-tight">
        <span>{owner.name}</span>
        <span className="text-xs text-muted-foreground">{owner.email}</span>
      </div>
    </div>
  );
}

function SchoolRow({
  school,
  onOpen,
}: {
  school: PlatformSchool;
  onOpen: (id: string) => void;
}) {
  const [owner] = school.owners;
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <SchoolCrest name={school.name} initials={initials(school.name)} />
          <div className="flex flex-col items-start">
            <button
              type="button"
              className="font-medium hover:underline focus-visible:underline"
              onClick={() => {
                onOpen(school.id);
              }}
            >
              {school.name}
            </button>
            <span className="font-mono text-xs text-muted-foreground">
              {school.slug}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {owner === undefined ? '—' : <OwnerCell owner={owner} />}
      </TableCell>
      <TableCell>{school.city ?? '—'}</TableCell>
      <TableCell className="text-right">{school.students}</TableCell>
      <TableCell>
        <StatusBadge status={school.status} />
      </TableCell>
      <TableCell>{fmtTimestamp(school.createdAt)}</TableCell>
    </TableRow>
  );
}

export function SchoolsTable({
  items,
  onOpen,
}: {
  items: PlatformSchool[];
  onOpen: (id: string) => void;
}) {
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
          <TableHead className="text-right">Students</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((school) => (
          <SchoolRow key={school.id} school={school} onOpen={onOpen} />
        ))}
      </TableBody>
    </Table>
  );
}
