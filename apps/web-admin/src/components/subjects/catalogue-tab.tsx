import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArchiveIcon,
  BookMarkedIcon,
  PencilIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { countOf, fmtTimestamp } from '@eduvault/shared';
import { SUBJECT_PAGE_SIZE, type Subject } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  NumberedPager,
  PageSkeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { subjectsQueryOptions } from '../../queries';
import {
  EditSubjectDialog,
  RetireSubjectDialog,
  useUpdateSubject,
} from './subject-dialogs';
import { taughtAt } from './subject-model';

function TaughtAtBadges({ levelCodes }: { levelCodes: readonly string[] }) {
  if (levelCodes.length === 0) {
    return <span className="text-muted-foreground">Not on any level</span>;
  }
  const { shown, more } = taughtAt(levelCodes);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((code) => (
        <Badge key={code} variant="secondary">
          {code}
        </Badge>
      ))}
      {more.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline">+{more.length}</Badge>
          </TooltipTrigger>
          <TooltipContent>{more.join(', ')}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

function StatusBadge({ subject }: { subject: Subject }) {
  if (subject.retiredAt === null) {
    return <Badge variant="outline">Active</Badge>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary">Archived</Badge>
      </TooltipTrigger>
      <TooltipContent>Retired {fmtTimestamp(subject.retiredAt)}</TooltipContent>
    </Tooltip>
  );
}

function RestoreButton({ subject }: { subject: Subject }) {
  const update = useUpdateSubject();
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={update.isPending}
      onClick={() => {
        update.mutate(
          { subject, body: { retired: false } },
          {
            onSuccess: () => {
              toast.success(`${subject.name} restored.`);
            },
            onError: (failure) => {
              toast.error(failure.message);
            },
          }
        );
      }}
    >
      <RotateCcwIcon />
      Restore
    </Button>
  );
}

function RowActions({
  subject,
  onEdit,
  onRetire,
}: {
  subject: Subject;
  onEdit: (subject: Subject) => void;
  onRetire: (subject: Subject) => void;
}) {
  return (
    <Can permission="subject:update">
      <span className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            onEdit(subject);
          }}
        >
          <PencilIcon />
          Edit
        </Button>
        {subject.retiredAt === null ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              onRetire(subject);
            }}
          >
            <ArchiveIcon />
            Retire
          </Button>
        ) : (
          <RestoreButton subject={subject} />
        )}
      </span>
    </Can>
  );
}

function SubjectRows({
  items,
  onEdit,
  onRetire,
}: {
  items: readonly Subject[];
  onEdit: (subject: Subject) => void;
  onRetire: (subject: Subject) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Taught at</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((subject) => (
          <TableRow key={subject.id}>
            <TableCell className="font-mono">{subject.code}</TableCell>
            <TableCell className="font-medium">{subject.name}</TableCell>
            <TableCell>
              <TaughtAtBadges levelCodes={subject.levelCodes} />
            </TableCell>
            <TableCell>
              <StatusBadge subject={subject} />
            </TableCell>
            <TableCell>
              <RowActions
                subject={subject}
                onEdit={onEdit}
                onRetire={onRetire}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NoSubjects() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookMarkedIcon />
        </EmptyMedia>
        <EmptyTitle>No subjects yet</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

function CatalogueCard({
  data,
  page,
  onPage,
}: {
  data: { items: readonly Subject[]; total: number };
  page: number;
  onPage: (page: number) => void;
}) {
  const [editing, setEditing] = useState<Subject | null>(null);
  const [retiring, setRetiring] = useState<Subject | null>(null);
  const { items, total } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookMarkedIcon aria-hidden="true" />
          Subject catalogue
        </CardTitle>
        <CardDescription>
          {countOf(total, 'subject', 'subjects')}.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {total === 0 ? (
          <NoSubjects />
        ) : (
          <SubjectRows
            items={items}
            onEdit={setEditing}
            onRetire={setRetiring}
          />
        )}
        {total > SUBJECT_PAGE_SIZE ? (
          <NumberedPager
            page={page}
            total={total}
            pageSize={SUBJECT_PAGE_SIZE}
            onPage={onPage}
          />
        ) : null}
      </CardContent>
      <EditSubjectDialog
        subject={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
      <RetireSubjectDialog
        subject={retiring}
        onClose={() => {
          setRetiring(null);
        }}
      />
    </Card>
  );
}

export function CatalogueTab({
  page,
  onPage,
}: {
  page: number;
  onPage: (page: number) => void;
}) {
  const subjects = useQuery(subjectsQueryOptions(useApi(), page));
  if (subjects.isPending) {
    return <PageSkeleton />;
  }
  if (subjects.data === undefined) {
    return <ErrorMessage error={subjects.error} />;
  }
  return <CatalogueCard data={subjects.data} page={page} onPage={onPage} />;
}
