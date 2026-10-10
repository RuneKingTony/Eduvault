import { CopyIcon } from 'lucide-react';
import type { Role } from '@eduvault/api-contract';
import {
  capabilityLabels,
  copyRolePermissions,
  type Permission,
  type PermissionMap,
} from '@eduvault/policy';
import {
  Button,
  Label,
  NativeSelect,
  NativeSelectOption,
  toast,
} from '@eduvault/ui';

const BUTTON_LIMIT = 4;

export interface RoleCopyResult {
  role: Role;
  kept: PermissionMap;
}

export function warnSkipped(skipped: readonly Permission[]): void {
  const labels = capabilityLabels(skipped);
  if (labels.length > 0) {
    toast.warning(
      `Skipped ${labels.length} you don’t hold: ${labels.join(', ')}`
    );
  }
}

function CopySelect({
  choices,
  onPick,
}: {
  choices: readonly Role[];
  onPick: (role: Role) => void;
}) {
  return (
    <NativeSelect
      id="role-copy-select"
      value=""
      onChange={(event) => {
        const picked = choices.find((role) => role.slug === event.target.value);
        if (picked !== undefined) {
          onPick(picked);
        }
      }}
    >
      <NativeSelectOption value="">Choose a role</NativeSelectOption>
      {choices.map((role) => (
        <NativeSelectOption key={role.slug} value={role.slug}>
          {role.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function CopyButtons({
  choices,
  onPick,
}: {
  choices: readonly Role[];
  onPick: (role: Role) => void;
}) {
  return choices.map((role) => (
    <Button
      key={role.slug}
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        onPick(role);
      }}
    >
      <CopyIcon />
      {role.label}
    </Button>
  ));
}

export function RoleCopy({
  roles,
  editorMap,
  onCopy,
}: {
  roles: readonly Role[];
  editorMap: PermissionMap;
  onCopy: (result: RoleCopyResult) => void;
}) {
  const choices = roles.filter((role) => role.source !== 'code');
  const pick = (role: Role) => {
    const { kept, skipped } = copyRolePermissions(role.permissions, editorMap);
    warnSkipped(skipped);
    onCopy({ role, kept });
  };
  if (choices.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor="role-copy-select" className="text-muted-foreground">
        Or copy
      </Label>
      {choices.length > BUTTON_LIMIT ? (
        <CopySelect choices={choices} onPick={pick} />
      ) : (
        <CopyButtons choices={choices} onPick={pick} />
      )}
    </div>
  );
}
