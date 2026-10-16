import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { Can } from '@eduvault/auth-client';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@eduvault/ui';
import { useApi } from '../api';
import { ByLevelTab, groupByLevel } from '../components/subjects/by-level-tab';
import { CatalogueTab } from '../components/subjects/catalogue-tab';
import { NewSubjectSheet } from '../components/subjects/new-subject-sheet';
import { SubjectTeachersTab } from '../components/subjects/subject-teachers-tab';
import {
  classLevelsQueryOptions,
  levelSubjectsQueryOptions,
  subjectTeachersQueryOptions,
  subjectsQueryOptions,
} from '../queries';
import { SUBJECT_TABS, type SubjectTab } from '../subjects-search';

const TAB_LABELS: Record<SubjectTab, string> = {
  catalogue: 'Catalogue',
  'by-level': 'By level',
  teachers: 'Subject teachers',
};

function useTabCounts(page: number): Record<SubjectTab, number | undefined> {
  const api = useApi();
  const subjects = useQuery(subjectsQueryOptions(api, page));
  const levels = useQuery(classLevelsQueryOptions(api));
  const rows = useQuery(levelSubjectsQueryOptions(api));
  const teachers = useQuery(subjectTeachersQueryOptions(api));
  return {
    catalogue: subjects.data?.total,
    'by-level':
      levels.data === undefined || rows.data === undefined
        ? undefined
        : groupByLevel(levels.data, rows.data).length,
    teachers: teachers.data?.arms.length,
  };
}

interface SubjectsPageProps {
  tab: SubjectTab;
  page: number;
  onTab: (tab: SubjectTab) => void;
  onPage: (page: number) => void;
}

function PageHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Subjects and teachers</h1>
        <p className="text-sm text-muted-foreground">
          The subject catalogue, what each class level takes, and who teaches
          what this term.
        </p>
      </div>
      <Can permission="subject:create">
        <Button type="button" onClick={onAdd}>
          <PlusIcon />
          Add subject
        </Button>
      </Can>
    </header>
  );
}

export function SubjectsPage({ tab, page, onTab, onPage }: SubjectsPageProps) {
  const [adding, setAdding] = useState(false);
  const counts = useTabCounts(page);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        onAdd={() => {
          setAdding(true);
        }}
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = SUBJECT_TABS.find((candidate) => candidate === value);
          if (next !== undefined) {
            onTab(next);
          }
        }}
      >
        <TabsList>
          {SUBJECT_TABS.map((name) => (
            <TabsTrigger key={name} value={name}>
              {TAB_LABELS[name]}
              {counts[name] === undefined ? '' : ` ${counts[name]}`}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="catalogue">
          <CatalogueTab page={page} onPage={onPage} />
        </TabsContent>
        <TabsContent value="by-level">
          <ByLevelTab />
        </TabsContent>
        <TabsContent value="teachers">
          <SubjectTeachersTab />
        </TabsContent>
      </Tabs>
      <NewSubjectSheet
        open={adding}
        onOpenChange={setAdding}
        onSeeLevels={() => {
          onTab('by-level');
        }}
      />
    </div>
  );
}
