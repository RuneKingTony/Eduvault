import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckIcon,
  MapPinIcon,
  ReceiptTextIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react';
import type {
  FeeCandidate,
  FeeCandidates,
  FeePreview,
} from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  Badge,
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
  NativeSelect,
  NativeSelectOption,
  SearchInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  feeCandidatesQueryOptions,
  feePreviewQueryOptions,
} from '../../queries';
import { CAMPUS_OVERRIDE_TIP } from './fee-text';

const labelOf = (student: FeeCandidate): string =>
  `${student.name} · ${student.admissionNumber}`;

function Badges({ preview }: { preview: FeePreview }) {
  const { student, charged } = preview;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">{student.armName ?? student.levelName}</Badge>
      <Badge variant="outline">
        <MapPinIcon />
        {student.campusName}
      </Badge>
      <Badge variant="secondary">
        {student.isNew ? 'New student' : 'Returning student'}
      </Badge>
      {charged === null && <Badge variant="warning">Not billed yet</Badge>}
      {charged && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="success">
              <CheckIcon />
              Already charged
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Charged as {charged.number ?? 'a draft'}. Charging again skips this
            student.
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function Lines({ preview }: { preview: FeePreview }) {
  if (preview.lines.length === 0) {
    return (
      <p className="px-4 text-sm text-muted-foreground">No fee lines apply</p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Line</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {preview.lines.map((line) => (
          <TableRow key={line.feeLineId ?? line.description}>
            <TableCell>
              <span className="flex flex-wrap items-center gap-1.5">
                {line.description}
                {line.optedIn ? (
                  <Badge variant="outline">Opted in</Badge>
                ) : null}
                {line.campusName === null ? null : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline">
                        <MapPinIcon />
                        {line.campusName}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{CAMPUS_OVERRIDE_TIP}</TooltipContent>
                  </Tooltip>
                )}
              </span>
            </TableCell>
            <TableCell
              className={`text-right tabular-nums ${line.amountMinor < 0 ? 'text-muted-foreground' : ''}`}
            >
              {money(line.amountMinor, preview.currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-medium">Total</TableCell>
          <TableCell className="text-right font-medium tabular-nums">
            {money(preview.totalMinor, preview.currency)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function PreviewBody({
  termId,
  studentId,
}: {
  termId: string;
  studentId: string;
}) {
  const preview = useQuery(feePreviewQueryOptions(useApi(), termId, studentId));
  if (preview.isPending) {
    return (
      <div role="status" aria-label="Loading" className="px-4">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (preview.data === undefined) {
    return (
      <div className="px-4">
        <ErrorMessage error={preview.error} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="px-4">
        <Badges preview={preview.data} />
      </div>
      <Lines preview={preview.data} />
      {preview.data.pendingDiscounts.length === 0 ? null : (
        <Alert className="mx-4 w-auto">
          <TriangleAlertIcon />
          <AlertDescription>
            Pending discount not applied yet:{' '}
            {preview.data.pendingDiscounts.join(', ')}. It applies once an
            approver agrees.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Picker({
  query,
  onQuery,
  matches,
  all,
  selected,
  onSelect,
}: {
  query: string;
  onQuery: (query: string) => void;
  matches: readonly FeeCandidate[];
  all: number;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const sorted = matches.toSorted((a, b) =>
    labelOf(a).localeCompare(labelOf(b))
  );
  return (
    <div className="flex flex-col gap-2 px-4">
      <SearchInput
        aria-label="Search students"
        placeholder="Search name, admission no. or class"
        value={query}
        onChange={(event) => {
          onQuery(event.target.value);
        }}
      />
      {query === '' ? null : (
        <p className="text-xs text-muted-foreground">
          {matches.length === 0
            ? 'No student matches that search'
            : `${matches.length} of ${all} students match`}
        </p>
      )}
      {matches.length === 0 ? null : (
        <NativeSelect
          aria-label="Preview student"
          className="w-full"
          value={selected}
          onChange={(event) => {
            onSelect(event.target.value);
          }}
        >
          {sorted.map((student) => (
            <NativeSelectOption key={student.id} value={student.id}>
              {labelOf(student)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </div>
  );
}

function NoStudents() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UsersIcon />
        </EmptyMedia>
        <EmptyTitle>No students in your scope</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

function CandidateBody({
  termId,
  query,
  onQuery,
  data,
}: {
  termId: string;
  query: string;
  onQuery: (query: string) => void;
  data: FeeCandidates;
}) {
  const [chosen, setChosen] = useState<string | undefined>();
  const selected =
    data.items.find((student) => student.id === chosen) ?? data.items[0];
  return (
    <>
      {data.total === 0 && query === '' ? (
        <NoStudents />
      ) : (
        <Picker
          query={query}
          onQuery={onQuery}
          matches={data.items}
          all={data.total}
          selected={selected?.id ?? ''}
          onSelect={setChosen}
        />
      )}
      {selected === undefined ? null : (
        <PreviewBody termId={termId} studentId={selected.id} />
      )}
    </>
  );
}

export function FeePreviewCard({ termId }: { termId: string }) {
  const [query, setQuery] = useState('');
  const candidates = useQuery(
    feeCandidatesQueryOptions(useApi(), termId, query.trim())
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ReceiptTextIcon className="size-4 text-muted-foreground" />
          Preview for one student
        </CardTitle>
        <CardDescription>
          Exactly what the next round of charges would be.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-0">
        {candidates.isPending ? (
          <div role="status" aria-label="Loading" className="px-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
        {candidates.isError ? (
          <div className="px-4">
            <ErrorMessage error={candidates.error} />
          </div>
        ) : null}
        {candidates.data === undefined ? null : (
          <CandidateBody
            termId={termId}
            query={query}
            onQuery={setQuery}
            data={candidates.data}
          />
        )}
      </CardContent>
    </Card>
  );
}
