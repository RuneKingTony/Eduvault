import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchXIcon } from 'lucide-react';
import { ApiError, type Role } from '@eduvault/api-contract';
import { OWNER_ROLE, ROLE_LABEL_MAX } from '@eduvault/policy';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  NavIcon,
  PageSkeleton,
} from '@eduvault/ui';
import { useApi } from '../api';
import { DeleteRoleDialog } from '../components/role-editor/delete-role-dialog';
import { RoleAdvancedGrid } from '../components/role-editor/role-advanced-grid';
import {
  ImportantDot,
  RoleAreas,
  type AreaChange,
} from '../components/role-editor/role-areas';
import {
  RoleCopy,
  warnSkipped,
  type RoleCopyResult,
} from '../components/role-editor/role-copy';
import { RoleDetails } from '../components/role-editor/role-details';
import {
  switchedOnText,
  thingsSwitchedOn,
  type RoleDraft,
} from '../components/role-editor/role-draft';
import {
  RoleCrumbs,
  RoleHeader,
  RoleNotes,
} from '../components/role-editor/role-header';
import { RoleHolders } from '../components/role-editor/role-holders';
import {
  useRoleEditor,
  type RoleEditorHandlers,
  type RoleEditorModel,
} from '../components/role-editor/use-role-editor';
import { roleQueryOptions, rolesQueryOptions } from '../queries';

interface RolePageProps extends RoleEditorHandlers {
  slug: string | undefined;
  onBack: () => void;
  onDeleted: () => void;
  onOpenMember: (memberId: string) => void;
}

function RoleNotFound({ onBack }: { onBack: () => void }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>Role not found</EmptyTitle>
        <EmptyDescription>
          We couldn’t find that role. It may have been moved or deleted.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={onBack}>
          Go back
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function abilitySummary(role: Role | undefined, count: number): string {
  if (role?.slug === OWNER_ROLE) {
    return 'Everything, including anything added later.';
  }
  if (count === 0) {
    return 'Nothing yet. Choose a level for each part of the app.';
  }
  return `${switchedOnText(count)}.`;
}

function AbilityCard({
  role,
  model,
}: {
  role: Role | undefined;
  model: RoleEditorModel;
}) {
  const { draft, setDraft } = model;
  const readOnly = !model.editable;
  const onAreaChange = ({ permissions, leftOut }: AreaChange) => {
    setDraft({ ...draft, permissions });
    warnSkipped(leftOut);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NavIcon name="key-round" className="size-4" />
          What this role can do
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1">
          {abilitySummary(role, thingsSwitchedOn(draft.permissions))}{' '}
          <ImportantDot /> marks things that touch money or access.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RoleAreas
          permissions={draft.permissions}
          editorMap={model.access}
          readOnly={readOnly}
          onChange={onAreaChange}
        />
        <RoleAdvancedGrid
          permissions={draft.permissions}
          editorMap={model.access}
          readOnly={readOnly}
          onChange={(permissions) => {
            setDraft({ ...draft, permissions });
          }}
        />
      </CardContent>
    </Card>
  );
}

function copiedDraft(draft: RoleDraft, { role, kept }: RoleCopyResult) {
  return {
    ...draft,
    permissions: kept,
    label:
      draft.label.trim() === ''
        ? `${role.label} (copy)`.slice(0, ROLE_LABEL_MAX)
        : draft.label,
  };
}

function DetailsColumn({
  role,
  catalogue,
  model,
  onOpenMember,
}: {
  role: Role | undefined;
  catalogue: readonly Role[];
  model: RoleEditorModel;
  onOpenMember: (memberId: string) => void;
}) {
  const { draft, setDraft } = model;
  return (
    <div className="flex flex-col gap-4">
      <RoleDetails
        label={draft.label}
        description={draft.description}
        readOnly={!model.editable}
        nameTouched={model.touched}
        nameError={model.labelTaken ? model.refusal?.message : undefined}
        onLabelChange={(label) => {
          setDraft({ ...draft, label });
        }}
        onLabelBlur={model.touch}
        onDescriptionChange={(description) => {
          setDraft({ ...draft, description });
        }}
      />
      <RoleHolders
        role={role}
        catalogue={catalogue}
        draft={draft.permissions}
        changed={model.changed}
        onOpenMember={onOpenMember}
      />
    </div>
  );
}

function RoleEditor({
  role,
  catalogue,
  props,
}: {
  role: Role | undefined;
  catalogue: readonly Role[];
  props: RolePageProps;
}) {
  const model = useRoleEditor(role, props);
  const [deleting, setDeleting] = useState(false);
  const { draft, setDraft } = model;
  return (
    <section className="flex flex-col gap-4">
      <RoleCrumbs label={role?.label ?? 'New role'} onBack={props.onBack} />
      <RoleHeader
        role={role}
        model={model}
        onDelete={() => {
          setDeleting(true);
        }}
      />
      <RoleNotes role={role} model={model} />
      <ErrorMessage
        error={model.refusal === undefined ? model.save.error : undefined}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {model.isNew && model.editable ? (
            <RoleCopy
              roles={catalogue}
              editorMap={model.access}
              onCopy={(result) => {
                setDraft(copiedDraft(draft, result));
              }}
            />
          ) : null}
          <AbilityCard role={role} model={model} />
        </div>
        <DetailsColumn
          role={role}
          catalogue={catalogue}
          model={model}
          onOpenMember={props.onOpenMember}
        />
      </div>
      {role !== undefined && model.canDelete ? (
        <DeleteRoleDialog
          role={role}
          open={deleting}
          onOpenChange={setDeleting}
          onDeleted={props.onDeleted}
        />
      ) : null}
    </section>
  );
}

function ExistingRole({ slug, props }: { slug: string; props: RolePageProps }) {
  const api = useApi();
  const role = useQuery(roleQueryOptions(api, slug));
  const roles = useQuery(rolesQueryOptions(api));
  if (role.error instanceof ApiError && role.error.status === 404) {
    return <RoleNotFound onBack={props.onBack} />;
  }
  if (role.data === undefined || roles.data === undefined) {
    const error = role.error ?? roles.error;
    return error === null ? (
      <PageSkeleton rows={3} />
    ) : (
      <ErrorMessage error={error} />
    );
  }
  return (
    <RoleEditor
      key={role.data.slug}
      role={role.data}
      catalogue={roles.data.items}
      props={props}
    />
  );
}

function NewRole({ props }: { props: RolePageProps }) {
  const api = useApi();
  const roles = useQuery(rolesQueryOptions(api));
  return (
    <RoleEditor
      key="new"
      role={undefined}
      catalogue={roles.data?.items ?? []}
      props={props}
    />
  );
}

export function RolePage(props: RolePageProps) {
  return props.slug === undefined ? (
    <NewRole props={props} />
  ) : (
    <ExistingRole slug={props.slug} props={props} />
  );
}
