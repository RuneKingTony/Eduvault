import type { ReactNode } from 'react';
import {
  CheckIcon,
  InfoIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { Role } from '@eduvault/api-contract';
import { MEMBER_ROLE, OWNER_ROLE } from '@eduvault/policy';
import {
  Alert,
  AlertDescription,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@eduvault/ui';
import { WithTooltip } from '../member-roles';
import { RoleSourceBadge } from './role-source-badge';
import type { RoleEditorModel } from './use-role-editor';

const BUILT_IN_NOTES: Record<string, string> = {
  [OWNER_ROLE]:
    'The owner can do everything, including anything added to the app later. It can’t be edited.',
  [MEMBER_ROLE]:
    'Everyone on the staff list has this role. On its own it allows nothing, and it can’t be edited.',
};

const READ_ONLY_NOTE = 'You can look at this role but not change it.';

function Callout({
  children,
  danger = false,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <Alert variant={danger ? 'destructive' : 'default'}>
      {danger ? <TriangleAlertIcon /> : <InfoIcon />}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function RoleCrumbs({
  label,
  onBack,
}: {
  label: string;
  onBack: () => void;
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <button type="button" onClick={onBack}>
              Roles
            </button>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function RoleMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="More actions"
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon />
          Delete role…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RoleHeader({
  role,
  model,
  onDelete,
}: {
  role: Role | undefined;
  model: RoleEditorModel;
  onDelete: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-center gap-2">
          {role?.label ?? 'New role'}
          {role === undefined ? null : <RoleSourceBadge source={role.source} />}
        </h1>
        <p className="text-sm text-muted-foreground">
          {role === undefined
            ? 'Name it, then choose what it can do.'
            : role.description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {model.editable ? (
          <WithTooltip text={model.disabledReason}>
            <Button
              type="button"
              disabled={
                model.disabledReason !== undefined || model.save.isPending
              }
              onClick={model.submit}
            >
              {model.isNew ? <CheckIcon /> : null}
              {model.isNew ? 'Create role' : 'Save changes'}
            </Button>
          </WithTooltip>
        ) : null}
        {model.canDelete ? <RoleMenu onDelete={onDelete} /> : null}
      </div>
    </header>
  );
}

export function RoleNotes({
  role,
  model,
}: {
  role: Role | undefined;
  model: RoleEditorModel;
}) {
  const builtInNote =
    role === undefined ? undefined : BUILT_IN_NOTES[role.slug];
  const showRefusal = model.refusal !== undefined && !model.labelTaken;
  return (
    <>
      {builtInNote === undefined ? null : <Callout>{builtInNote}</Callout>}
      {role === undefined || model.builtIn || model.editable ? null : (
        <Callout>{READ_ONLY_NOTE}</Callout>
      )}
      {showRefusal ? <Callout danger>{model.refusal?.message}</Callout> : null}
    </>
  );
}
