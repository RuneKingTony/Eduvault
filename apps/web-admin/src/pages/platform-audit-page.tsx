import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
import {
  Button,
  ErrorMessage,
  Label,
  NativeSelect,
  NativeSelectOption,
  Switch,
  TablePager,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { AuditTable } from '../components/audit-table';
import { useCursorPages } from '../components/cursor-pages';
import { useSchoolOptions } from '../components/use-school-options';
import { platformAuditQueryOptions } from '../queries';

const INFO =
  'Reads are logged too. Rows are kept until a retention period is agreed.';

function Filters({
  schoolId,
  writesOnly,
  onSchool,
  onWritesOnly,
}: {
  schoolId: string;
  writesOnly: boolean;
  onSchool: (id: string) => void;
  onWritesOnly: (on: boolean) => void;
}) {
  const schools = useSchoolOptions();
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="audit-school">School</Label>
        <NativeSelect
          id="audit-school"
          value={schoolId}
          onChange={(event) => {
            onSchool(event.target.value);
          }}
        >
          <NativeSelectOption value="">All schools</NativeSelectOption>
          {schools.data?.map((school) => (
            <NativeSelectOption key={school.id} value={school.id}>
              {school.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <ErrorMessage error={schools.error} />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="audit-writes-only"
          checked={writesOnly}
          onCheckedChange={onWritesOnly}
        />
        <Label htmlFor="audit-writes-only">Writes only</Label>
      </div>
    </div>
  );
}

function AuditHead() {
  return (
    <header className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Audit log</h1>
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
        Every request a super admin makes while acting inside a school, and
        every platform action.
      </p>
    </header>
  );
}

export function PlatformAuditPage() {
  const api = useApi();
  const pages = useCursorPages();
  const [schoolId, setSchoolId] = useState('');
  const [writesOnly, setWritesOnly] = useState(false);
  const audit = useQuery({
    ...platformAuditQueryOptions(api, {
      ...(schoolId === '' ? {} : { schoolId }),
      ...(writesOnly ? { writesOnly } : {}),
      cursor: pages.cursor,
    }),
    placeholderData: keepPreviousData,
  });
  const nextCursor = audit.data?.nextCursor ?? null;

  return (
    <section className="flex flex-col gap-5">
      <AuditHead />
      <Filters
        schoolId={schoolId}
        writesOnly={writesOnly}
        onSchool={(id) => {
          setSchoolId(id);
          pages.reset();
        }}
        onWritesOnly={(on) => {
          setWritesOnly(on);
          pages.reset();
        }}
      />
      <ErrorMessage error={audit.error} />
      <AuditTable rows={audit.data?.items ?? []} />
      <TablePager
        page={pages.page}
        hasNext={nextCursor !== null}
        onPrevious={pages.previous}
        onNext={() => {
          if (nextCursor !== null) {
            pages.next(nextCursor);
          }
        }}
      />
    </section>
  );
}
