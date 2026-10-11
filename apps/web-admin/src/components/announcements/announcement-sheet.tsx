import { useState, type MouseEvent, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, SendIcon } from 'lucide-react';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TEXT_REQUIRED,
  ANNOUNCEMENT_TITLE_MAX,
  ApiError,
  announcementTagSchema,
  createAnnouncementSchema,
  type Announcement,
  type AnnouncementStatus,
  type Campus,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  ANNOUNCEMENT_TAGS,
  Button,
  Checkbox,
  Label,
  NativeSelectOption,
  SelectField,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { campusesQueryOptions, invalidateAnnouncements } from '../../queries';
import { noticeFor } from './announcement-text';
import { refusalMessage } from './use-announcement-actions';

const EVERYONE = 'everyone';

function defaultAudience(
  editing: Announcement | null,
  campuses: readonly Campus[],
  canReachAll: boolean
): string {
  if (editing !== null) {
    return editing.campusId ?? EVERYONE;
  }
  const [only] = campuses;
  if (campuses.length === 1 && only !== undefined) {
    return only.id;
  }
  return canReachAll ? EVERYONE : (only?.id ?? '');
}

function useSave(
  editing: Announcement | null,
  done: (saved: Announcement) => void,
  gone: () => void
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnType<typeof createAnnouncementSchema.parse>) => {
      if (editing === null) {
        return api.announcements.create({ body });
      }
      const { status, ...content } = body;
      return api.announcements.update({
        params: { id: editing.id },
        body: editing.status === 'published' ? content : { ...content, status },
      });
    },
    onSuccess: async (saved) => {
      await invalidateAnnouncements(queryClient);
      toast.success(noticeFor(editing, saved));
      done(saved);
    },
    onError: (failure) => {
      toast.error(refusalMessage(failure));
      if (failure instanceof ApiError && failure.status === 404) {
        gone();
      }
    },
  });
}

function AudienceField({
  editing,
  campuses,
}: {
  editing: Announcement | null;
  campuses: readonly Campus[];
}) {
  const canReachAll = useCan('campus', 'readAll');
  return (
    <SelectField
      label="Who sees it"
      name="campusId"
      defaultValue={defaultAudience(editing, campuses, canReachAll)}
    >
      {canReachAll ? (
        <NativeSelectOption value={EVERYONE}>Everyone</NativeSelectOption>
      ) : null}
      {campuses.map((campus) => (
        <NativeSelectOption key={campus.id} value={campus.id}>
          {campus.name} families only
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function BodyField({ defaultValue }: { defaultValue: string }) {
  const [length, setLength] = useState(defaultValue.length);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="announcement-body">Message</Label>
      <Textarea
        id="announcement-body"
        name="body"
        rows={5}
        maxLength={ANNOUNCEMENT_BODY_MAX}
        defaultValue={defaultValue}
        aria-describedby="announcement-body-hint"
        placeholder="What families need to know, and what they should do."
        onChange={(event) => {
          setLength(event.target.value.length);
        }}
      />
      <div
        id="announcement-body-hint"
        className="flex justify-between text-xs text-muted-foreground"
      >
        <span>Keep it short. Say when, where and what to bring or pay.</span>
        <span>{`${length} / ${ANNOUNCEMENT_BODY_MAX.toLocaleString('en-US')}`}</span>
      </div>
    </div>
  );
}

function TypeField({ defaultValue }: { defaultValue: string }) {
  return (
    <SelectField label="Type" name="tag" defaultValue={defaultValue}>
      {announcementTagSchema.options.map((tag) => (
        <NativeSelectOption key={tag} value={tag}>
          {ANNOUNCEMENT_TAGS[tag].label}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function PinField({
  pinned,
  onChange,
}: {
  pinned: boolean;
  onChange: (pinned: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="announcement-pin"
        checked={pinned}
        onCheckedChange={(next) => {
          onChange(next === true);
        }}
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor="announcement-pin">Pin to the top</Label>
        <p className="text-xs text-muted-foreground">
          Stays first on the portal until you unpin it. Use it for anything
          urgent.
        </p>
      </div>
    </div>
  );
}

function useEditorForm(
  editing: Announcement | null,
  onSaved: (status: AnnouncementStatus) => void,
  onClose: () => void
) {
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  const save = useSave(
    editing,
    (saved) => {
      onSaved(saved.status);
      onClose();
    },
    onClose
  );

  function send(form: HTMLFormElement, status: 'draft' | 'published') {
    const data = new FormData(form);
    const audience = fieldValue(data, 'campusId');
    const parsed = createAnnouncementSchema.safeParse({
      title: fieldValue(data, 'title'),
      body: fieldValue(data, 'body'),
      tag: fieldValue(data, 'tag'),
      campusId: audience === EVERYONE ? null : audience,
      pinned: status === 'published' && pinned,
      status,
    });
    if (parsed.success) {
      save.mutate(parsed.data);
    } else {
      toast.error(ANNOUNCEMENT_TEXT_REQUIRED);
    }
  }

  return {
    pinned,
    setPinned,
    pending: save.isPending,
    publish: (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      send(event.currentTarget, 'published');
    },
    saveAsDraft: (event: MouseEvent<HTMLButtonElement>) => {
      const { form } = event.currentTarget;
      if (form !== null) {
        send(form, 'draft');
      }
    },
  };
}

function EditorFooter({
  pending,
  publishedAlready,
  onDraft,
  onClose,
}: {
  pending: boolean;
  publishedAlready: boolean;
  onDraft: (event: MouseEvent<HTMLButtonElement>) => void;
  onClose: () => void;
}) {
  return (
    <SheetFooter>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      {publishedAlready ? null : (
        <Button
          type="button"
          form="announcement"
          variant="outline"
          disabled={pending}
          onClick={onDraft}
        >
          <PencilIcon />
          Save as draft
        </Button>
      )}
      <Button type="submit" form="announcement" disabled={pending}>
        <SendIcon />
        {publishedAlready ? 'Save changes' : 'Publish'}
      </Button>
    </SheetFooter>
  );
}

function EditorForm({
  editing,
  campuses,
  onSaved,
  onClose,
}: {
  editing: Announcement | null;
  campuses: readonly Campus[];
  onSaved: (status: AnnouncementStatus) => void;
  onClose: () => void;
}) {
  const state = useEditorForm(editing, onSaved, onClose);
  return (
    <>
      <form
        id="announcement"
        onSubmit={state.publish}
        noValidate
        className="flex flex-col gap-3 px-4"
      >
        <TextField
          label="Title"
          name="title"
          autoComplete="off"
          maxLength={ANNOUNCEMENT_TITLE_MAX}
          defaultValue={editing?.title ?? ''}
          placeholder="e.g. Mid-term break starts Thursday"
        />
        <BodyField defaultValue={editing?.body ?? ''} />
        <TypeField defaultValue={editing?.tag ?? 'general'} />
        <AudienceField editing={editing} campuses={campuses} />
        <PinField pinned={state.pinned} onChange={state.setPinned} />
      </form>
      <EditorFooter
        pending={state.pending}
        publishedAlready={editing?.status === 'published'}
        onDraft={state.saveAsDraft}
        onClose={onClose}
      />
    </>
  );
}

function EditorBody(props: {
  editing: Announcement | null;
  onSaved: (status: AnnouncementStatus) => void;
  onClose: () => void;
}) {
  const campuses = useQuery(campusesQueryOptions(useApi()));
  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {props.editing === null ? 'New announcement' : 'Edit announcement'}
        </SheetTitle>
        <SheetDescription>
          Parents and students see this on their portal home page.
        </SheetDescription>
      </SheetHeader>
      {campuses.data === undefined ? null : (
        <EditorForm {...props} campuses={campuses.data} />
      )}
    </>
  );
}

export function AnnouncementSheet({
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  editing: Announcement | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (status: AnnouncementStatus) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <EditorBody
          key={editing?.id ?? 'new'}
          editing={editing}
          onSaved={onSaved}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
