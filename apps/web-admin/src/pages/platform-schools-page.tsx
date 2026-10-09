import { useDeferredValue, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { InfoIcon, PlusIcon } from 'lucide-react';
import type { CreateSchoolResult } from '@eduvault/api-contract';
import {
  Button,
  ErrorMessage,
  Input,
  TablePager,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { CreateSchoolSheet } from '../components/create-school-sheet';
import { CreatedSchoolDialog } from '../components/created-school-dialog';
import { useCursorPages } from '../components/cursor-pages';
import { SchoolStats } from '../components/school-stats';
import { SchoolsTable } from '../components/schools-table';
import { platformSchoolsQueryOptions } from '../queries';

const INFO = 'Only a super admin creates schools.';
const SEARCH_ABOVE = 10;

function Head({ count, onCreate }: { count: number; onCreate: () => void }) {
  return (
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
          {count} {count === 1 ? 'school' : 'schools'} on Eduvault
        </p>
      </div>
      <Button type="button" onClick={onCreate}>
        <PlusIcon />
        Create school
      </Button>
    </header>
  );
}

function useSchoolsList() {
  const api = useApi();
  const pages = useCursorPages();
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const schools = useQuery({
    ...platformSchoolsQueryOptions(api, {
      ...(q === '' ? {} : { q }),
      cursor: pages.cursor,
    }),
    placeholderData: keepPreviousData,
  });
  return {
    schools,
    pages,
    search,
    onSearch: (value: string) => {
      setSearch(value);
      pages.reset();
    },
    nextCursor: schools.data?.nextCursor ?? null,
  };
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="search"
      aria-label="Search schools by name or slug"
      placeholder="Search by name or slug"
      value={value}
      className="max-w-sm"
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

export function PlatformSchoolsPage({
  onOpenSchool,
  onOpenAudit,
}: {
  onOpenSchool: (schoolId: string) => void;
  onOpenAudit: () => void;
}) {
  const { schools, pages, search, onSearch, nextCursor } = useSchoolsList();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateSchoolResult | null>(null);
  const totals = schools.data?.totals;

  return (
    <section className="flex flex-col gap-5">
      <Head
        count={totals?.schools ?? 0}
        onCreate={() => {
          setCreating(true);
        }}
      />
      <SchoolStats totals={totals} onOpenAudit={onOpenAudit} />
      {(totals?.schools ?? 0) > SEARCH_ABOVE ? (
        <SearchBox value={search} onChange={onSearch} />
      ) : null}
      <ErrorMessage error={schools.error} />
      <SchoolsTable items={schools.data?.items ?? []} onOpen={onOpenSchool} />
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
