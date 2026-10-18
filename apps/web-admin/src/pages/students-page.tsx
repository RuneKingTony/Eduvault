import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarPlusIcon,
  GraduationCapIcon,
  InfoIcon,
  SearchIcon,
  UserCheckIcon,
  UserPlusIcon,
  UserXIcon,
} from 'lucide-react';
import {
  STUDENT_PAGE_SIZE,
  STUDENT_TABS,
  type AdmitStudentResult,
  type StudentCounts,
  type StudentList,
  type StudentTab,
} from '@eduvault/api-contract';
import { useCan, useCanAny, usePermissions } from '@eduvault/auth-client';
import { FINANCE_READ_GATE } from '@eduvault/policy';
import {
  Alert,
  AlertDescription,
  Button,
  CampusSelect,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  Input,
  NativeSelect,
  NativeSelectOption,
  NumberedPager,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useCanAdmit } from '../admission-rules';
import { useApi } from '../api';
import { AdmitStudentSheet } from '../components/admit-student-sheet';
import type { GuardianAction } from '../components/guardian-actions';
import { GuardianDialogs } from '../components/guardian-dialogs';
import { StartYearDialog } from '../components/start-year-dialog';
import { StudentTable } from '../components/student-table';
import {
  campusesQueryOptions,
  classLevelsQueryOptions,
  classesQueryOptions,
  currentTermQueryOptions,
  schoolProfileQueryOptions,
  studentsQueryOptions,
} from '../queries';
import type { StudentsSearch } from '../students-search';

interface StudentsPageProps {
  search: StudentsSearch;
  schoolName: string;
  onSearchChange: (next: StudentsSearch) => void;
  onOpenStudent: (id: string) => void;
  onRecordLeaving: (id: string) => void;
  onAdmitted: (result: AdmitStudentResult) => void;
  onOpenCalendar: () => void;
}

const TAB_LABELS: Record<StudentTab, string> = {
  active: 'Active',
  new: 'New intakes',
  inactive: 'Inactive',
  left: 'Left',
  graduated: 'Graduated',
};

const ALL = '';

function useScope(): { note: string; tip: string } {
  const api = useApi();
  const { campusScope, classScope } = usePermissions();
  const campuses = useQuery(campusesQueryOptions(api));
  const classes = useQuery({
    ...classesQueryOptions(api, 'active'),
    enabled: classScope !== 'all',
  });
  if (classScope !== 'all') {
    const names = (classes.data ?? [])
      .filter((row) => classScope.includes(row.id))
      .map((row) => row.displayName);
    return {
      note:
        names.length === 0
          ? 'Students in your classes'
          : `Students placed this term in ${names.join(', ')}`,
      tip: 'You see the students in the classes you teach.',
    };
  }
  if (campusScope !== 'all') {
    const names = (campuses.data ?? []).map((campus) => campus.name);
    return {
      note: `${names.join(', ')} campus`,
      tip: 'You see the students on your campus.',
    };
  }
  return { note: 'All campuses', tip: 'You see students on every campus.' };
}

function Header({
  props,
  shown,
  startYear,
}: {
  props: StudentsPageProps;
  shown: number | undefined;
  startYear: StudentList['startYear'] | undefined;
}) {
  const scope = useScope();
  const admit = useCanAdmit();
  const canPlace = useCan('enrollment', 'place');
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-1">
          Students
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="About this list">
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{scope.tip}</TooltipContent>
          </Tooltip>
        </h1>
        <p className="text-sm text-muted-foreground">
          {scope.note}
          {shown === undefined ? '' : ` · ${shown} shown`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canPlace && startYear !== null && startYear !== undefined ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              props.onSearchChange({ ...props.search, dialog: 'start-year' });
            }}
          >
            <CalendarPlusIcon />
            Start {startYear.name}
          </Button>
        ) : null}
        {admit ? (
          <Button
            type="button"
            onClick={() => {
              props.onSearchChange({ ...props.search, admit: 1 });
            }}
          >
            <UserPlusIcon />
            Admit student
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function CountTabs({
  tab,
  counts,
  onTab,
}: {
  tab: StudentTab;
  counts: StudentCounts | undefined;
  onTab: (tab: StudentTab) => void;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = STUDENT_TABS.find((candidate) => candidate === value);
        if (next !== undefined) {
          onTab(next);
        }
      }}
    >
      <TabsList>
        {STUDENT_TABS.map((name) => (
          <TabsTrigger key={name} value={name}>
            {TAB_LABELS[name]}
            {counts === undefined ? '' : ` ${counts[name]}`}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

type Patch = (patch: Partial<StudentsSearch>) => void;

function SearchBox({
  search,
  onChange,
}: {
  search: StudentsSearch;
  onChange: Patch;
}) {
  const api = useApi();
  const canReadSchool = useCan('schoolAccount', 'read');
  const profile = useQuery({
    ...schoolProfileQueryOptions(api),
    enabled: canReadSchool,
  });
  return (
    <Input
      type="search"
      aria-label="Search"
      placeholder={`Search name or ${profile.data?.admissionPrefix ?? 'admission'} number`}
      defaultValue={search.q ?? ''}
      className="max-w-xs"
      onChange={(event) => {
        const q = event.target.value.trim();
        onChange({ q: q === '' ? undefined : q });
      }}
    />
  );
}

function CampusFilter({
  search,
  onChange,
}: {
  search: StudentsSearch;
  onChange: Patch;
}) {
  const campuses = useQuery(campusesQueryOptions(useApi()));
  return (
    <CampusSelect
      campuses={campuses.data ?? []}
      value={search.campusId}
      onChange={(campusId) => {
        onChange({ campusId });
      }}
    />
  );
}

function LevelFilter({
  search,
  onChange,
}: {
  search: StudentsSearch;
  onChange: Patch;
}) {
  const api = useApi();
  const canReadClasses = useCan('class', 'read');
  const levels = useQuery({
    ...classLevelsQueryOptions(api),
    enabled: canReadClasses,
  });
  if (levels.data === undefined) {
    return null;
  }
  return (
    <NativeSelect
      aria-label="Level"
      value={search.levelId ?? ALL}
      onChange={(event) => {
        onChange({ levelId: event.target.value || undefined });
      }}
    >
      <NativeSelectOption value={ALL}>All levels</NativeSelectOption>
      {levels.data.map((level) => (
        <NativeSelectOption key={level.id} value={level.id}>
          {level.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function Toolbar({ props }: { props: StudentsPageProps }) {
  const { search, onSearchChange } = props;
  const change: Patch = (patch) => {
    onSearchChange({ ...search, ...patch, page: undefined });
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBox search={search} onChange={change} />
      <CampusFilter search={search} onChange={change} />
      <LevelFilter search={search} onChange={change} />
    </div>
  );
}

const EMPTY: Record<
  StudentTab,
  {
    icon: typeof SearchIcon;
    title: string;
    description: (year: string) => string;
  }
> = {
  active: {
    icon: SearchIcon,
    title: 'No students match',
    description: () => 'Try a different name, campus or level.',
  },
  new: {
    icon: UserPlusIcon,
    title: 'No new intakes',
    description: (year) => `Nobody admitted in ${year} matches.`,
  },
  inactive: {
    icon: UserCheckIcon,
    title: 'Nobody is inactive',
    description: () => 'Every student has been seen in the last 5 weeks.',
  },
  left: {
    icon: UserXIcon,
    title: 'Nobody has left',
    description: () => 'Students recorded as leaving appear here.',
  },
  graduated: {
    icon: GraduationCapIcon,
    title: 'No graduates yet',
    description: () =>
      'Graduate a final-year class from its class page, or start the school year.',
  },
};

function EmptyTab({ tab, year }: { tab: StudentTab; year: string }) {
  const { icon: Icon, title, description } = EMPTY[tab];
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description(year)}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function useCurrentYear(): string {
  const api = useApi();
  const canSee = useCan('session', 'read');
  const current = useQuery({
    ...currentTermQueryOptions(api),
    enabled: canSee,
  });
  return current.data?.schoolYear?.name ?? 'this school year';
}

function LoadingRows() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2 p-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

function useColumnFlags(currency: string | undefined) {
  const api = useApi();
  const guardianRead = useCan('guardian', 'read');
  const canArchive = useCan('student', 'archive');
  const financeRead = useCanAny(FINANCE_READ_GATE);
  const campuses = useQuery(campusesQueryOptions(api));
  return {
    guardianRead,
    canArchive,
    financeRead,
    currency,
    campusColumn: (campuses.data ?? []).length > 1,
  };
}

function StudentsTableArea({
  props,
  tab,
  onAction,
}: {
  props: StudentsPageProps;
  tab: StudentTab;
  onAction: (action: GuardianAction) => void;
}) {
  const api = useApi();
  const { search, onSearchChange } = props;
  const list = useQuery(studentsQueryOptions(api, search));
  const flags = useColumnFlags(list.data?.currency);
  const year = useCurrentYear();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (!next.delete(id)) {
      next.add(id);
    }
    setExpanded(next);
  };
  if (list.isPending) {
    return <LoadingRows />;
  }
  if (list.data === undefined) {
    return <ErrorMessage error={list.error} />;
  }
  if (list.data.items.length === 0) {
    return <EmptyTab tab={tab} year={year} />;
  }
  return (
    <>
      <StudentTable
        rows={list.data.items}
        tab={tab}
        flags={flags}
        expanded={expanded}
        actions={{
          onToggle: toggle,
          onOpen: props.onOpenStudent,
          onRecordLeaving: props.onRecordLeaving,
          onAction,
        }}
      />
      {list.data.total > STUDENT_PAGE_SIZE ? (
        <NumberedPager
          page={search.page ?? 1}
          total={list.data.total}
          pageSize={STUDENT_PAGE_SIZE}
          onPage={(next) => {
            onSearchChange({ ...search, page: next > 1 ? next : undefined });
          }}
        />
      ) : null}
    </>
  );
}

function StudentsCard({
  props,
  onAction,
}: {
  props: StudentsPageProps;
  onAction: (action: GuardianAction) => void;
}) {
  const api = useApi();
  const { search, onSearchChange } = props;
  const tab = search.tab ?? 'active';
  const list = useQuery(studentsQueryOptions(api, search));
  const year = useCurrentYear();
  return (
    <div className="flex flex-col gap-3">
      <CountTabs
        tab={tab}
        counts={list.data?.counts}
        onTab={(next) => {
          onSearchChange({
            ...search,
            tab: next === 'active' ? undefined : next,
            page: undefined,
          });
        }}
      />
      {tab === 'new' ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Students admitted in {year}. They are Active students, shown here so
            you can follow their first fees.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="rounded-xl border">
        <div className="border-b p-3">
          <Toolbar props={props} />
        </div>
        <StudentsTableArea props={props} tab={tab} onAction={onAction} />
      </div>
    </div>
  );
}

export function StudentsPage(props: StudentsPageProps) {
  const api = useApi();
  const { search, onSearchChange } = props;
  const list = useQuery(studentsQueryOptions(api, search));
  const admit = useCanAdmit();
  const canPlace = useCan('enrollment', 'place');
  const [action, setAction] = useState<GuardianAction | null>(null);
  return (
    <section className="flex flex-col gap-4">
      <Header
        props={props}
        shown={list.data?.total}
        startYear={list.data?.startYear}
      />
      <StudentsCard props={props} onAction={setAction} />
      {admit ? (
        <AdmitStudentSheet
          open={search.admit === 1}
          onOpenChange={(open) => {
            onSearchChange({ ...search, admit: open ? 1 : undefined });
          }}
          onAdmitted={props.onAdmitted}
          onOpenCalendar={props.onOpenCalendar}
        />
      ) : null}
      {canPlace && search.dialog === 'start-year' ? (
        <StartYearDialog
          onOpenChange={(open) => {
            onSearchChange({
              ...search,
              dialog: open ? 'start-year' : undefined,
            });
          }}
          onOpenCalendar={props.onOpenCalendar}
        />
      ) : null}
      <GuardianDialogs
        action={action}
        schoolName={props.schoolName}
        onAction={setAction}
      />
    </section>
  );
}
