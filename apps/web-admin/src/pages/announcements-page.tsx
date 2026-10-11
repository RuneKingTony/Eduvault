import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MegaphoneIcon, PlusIcon } from 'lucide-react';
import {
  ANNOUNCEMENT_PAGE_SIZE,
  type Announcement,
  type AnnouncementCounts,
  type AnnouncementStatus,
} from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import {
  Button,
  Card,
  CardContent,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  NumberedPager,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { AnnouncementRow } from '../components/announcements/announcement-row';
import { AnnouncementSheet } from '../components/announcements/announcement-sheet';
import {
  EMPTY_STATES,
  STATUS_TABS,
} from '../components/announcements/announcement-text';
import { useRowAction } from '../components/announcements/use-announcement-actions';
import { announcementsQueryOptions } from '../queries';

interface EditorState {
  open: boolean;
  editing: Announcement | null;
}

function StatusTabs({
  status,
  counts,
  onChange,
}: {
  status: AnnouncementStatus;
  counts: AnnouncementCounts | undefined;
  onChange: (status: AnnouncementStatus) => void;
}) {
  return (
    <Tabs
      value={status}
      onValueChange={(next) => {
        onChange(next as AnnouncementStatus);
      }}
    >
      <TabsList>
        {STATUS_TABS.map((tab) => (
          <TabsTrigger key={tab.status} value={tab.status}>
            {tab.label}
            {counts === undefined ? null : (
              <span className="text-muted-foreground tabular-nums">
                {counts[tab.status]}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function EmptyTab({
  status,
  onNew,
}: {
  status: AnnouncementStatus;
  onNew: () => void;
}) {
  const { title, text } = EMPTY_STATES[status];
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MegaphoneIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
      {status === 'published' ? (
        <Can permission="announcement:create">
          <EmptyContent>
            <Button type="button" onClick={onNew}>
              <PlusIcon />
              New announcement
            </Button>
          </EmptyContent>
        </Can>
      ) : null}
    </Empty>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3 p-4">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

function AnnouncementsHeader({ onNew }: { onNew: () => void }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>Announcements</h1>
        <p className="text-sm text-muted-foreground">
          News for parents and students. It appears on their portal home page.
        </p>
      </div>
      <Can permission="announcement:create">
        <Button type="button" onClick={onNew}>
          <PlusIcon />
          New announcement
        </Button>
      </Can>
    </header>
  );
}

function usePageState() {
  const api = useApi();
  const [status, setStatus] = useState<AnnouncementStatus>('published');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    editing: null,
  });
  const showTab = (next: AnnouncementStatus) => {
    setStatus(next);
    setPage(1);
  };
  return {
    status,
    page,
    setPage,
    showTab,
    editor,
    setEditor,
    list: useQuery(announcementsQueryOptions(api, status, page)),
    act: useRowAction(showTab),
  };
}

function ListBody({
  state,
  onEdit,
}: {
  state: ReturnType<typeof usePageState>;
  onEdit: (row: Announcement | null) => void;
}) {
  const { list, act, status } = state;
  const data = list.data;
  return (
    <>
      {list.isPending ? <ListSkeleton /> : null}
      {list.isError ? (
        <div className="p-4">
          <ErrorMessage error={list.error} />
        </div>
      ) : null}
      {data?.items.length === 0 ? (
        <EmptyTab
          status={status}
          onNew={() => {
            onEdit(null);
          }}
        />
      ) : null}
      {data === undefined || data.items.length === 0 ? null : (
        <ul className="divide-y">
          {data.items.map((row) => (
            <AnnouncementRow
              key={row.id}
              row={row}
              busy={act.isPending}
              onEdit={onEdit}
              onAct={(target, action) => {
                act.mutate({ id: target.id, action });
              }}
            />
          ))}
        </ul>
      )}
      {data !== undefined && data.total > ANNOUNCEMENT_PAGE_SIZE ? (
        <NumberedPager
          page={state.page}
          total={data.total}
          pageSize={ANNOUNCEMENT_PAGE_SIZE}
          onPage={state.setPage}
        />
      ) : null}
    </>
  );
}

export function AnnouncementsPage() {
  const state = usePageState();
  const { editor } = state;
  const openEditor = (editing: Announcement | null) => {
    state.setEditor({ open: true, editing });
  };

  return (
    <section className="flex flex-col gap-4">
      <AnnouncementsHeader
        onNew={() => {
          openEditor(null);
        }}
      />
      <StatusTabs
        status={state.status}
        counts={state.list.data?.counts}
        onChange={state.showTab}
      />
      <Card>
        <CardContent className="px-0">
          <ListBody state={state} onEdit={openEditor} />
        </CardContent>
      </Card>
      <AnnouncementSheet
        open={editor.open}
        editing={editor.editing}
        onOpenChange={(open) => {
          state.setEditor((previous) => ({ ...previous, open }));
        }}
        onSaved={state.showTab}
      />
    </section>
  );
}
