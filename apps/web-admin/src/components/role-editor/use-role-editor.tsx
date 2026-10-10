import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, type Role } from '@eduvault/api-contract';
import { usePermissions } from '@eduvault/auth-client';
import { can, missingPermissions, type PermissionMap } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateRoles } from '../../queries';
import {
  EMPTY_DRAFT,
  draftBody,
  draftOf,
  sameDraft,
  type RoleDraft,
} from './role-draft';

export interface RoleEditorHandlers {
  onCreated: (slug: string) => void;
  onAssign: () => void;
}

interface Flags {
  isNew: boolean;
  builtIn: boolean;
  editable: boolean;
  canDelete: boolean;
}

function roleFlags(role: Role | undefined, access: PermissionMap): Flags {
  if (role === undefined) {
    return {
      isNew: true,
      builtIn: false,
      editable: can(access, 'ac', 'create'),
      canDelete: false,
    };
  }
  const builtIn = role.source === 'code';
  return {
    isNew: false,
    builtIn,
    editable: role.editable && !builtIn,
    canDelete:
      !builtIn &&
      can(access, 'ac', 'delete') &&
      missingPermissions(role.permissions, access).length === 0,
  };
}

function disabledSaveReason(state: {
  draft: RoleDraft;
  changed: boolean;
  isNew: boolean;
}): string | undefined {
  if (state.draft.label.trim() === '') {
    return 'Give the role a name first';
  }
  return state.isNew || state.changed ? undefined : 'No changes yet';
}

function useSaveRole(
  role: Role | undefined,
  draft: RoleDraft,
  handlers: RoleEditorHandlers
) {
  const api = useApi();
  const queryClient = useQueryClient();
  const canAssign = can(usePermissions().permissions, 'member', 'update');
  return useMutation({
    mutationFn: () =>
      role === undefined
        ? api.roles.create({ body: draftBody(draft) })
        : api.roles.update({
            params: { slug: role.slug },
            body: draftBody(draft),
          }),
    onSuccess: async (saved) => {
      await invalidateRoles(queryClient);
      if (role !== undefined) {
        toast.success(
          'Role saved. Holders get the change on their next request.'
        );
        return;
      }
      toast.success(
        <>
          Role <strong>{saved.label}</strong> created.
        </>,
        canAssign
          ? {
              action: {
                label: 'Assign it to someone',
                onClick: handlers.onAssign,
              },
            }
          : undefined
      );
      handlers.onCreated(saved.slug);
    },
  });
}

export function useRoleEditor(
  role: Role | undefined,
  handlers: RoleEditorHandlers
) {
  const access = usePermissions().permissions;
  const baseline = role === undefined ? EMPTY_DRAFT : draftOf(role);
  const [draft, setDraft] = useState(baseline);
  const [touched, setTouched] = useState(false);
  const save = useSaveRole(role, draft, handlers);
  const flags = roleFlags(role, access);
  const changed = !sameDraft(draft, baseline);
  const refusal = save.error instanceof ApiError ? save.error : undefined;
  return {
    ...flags,
    access,
    draft,
    setDraft,
    changed,
    touched,
    save,
    refusal,
    labelTaken: refusal?.body.code === 'ROLE_LABEL_TAKEN',
    disabledReason: disabledSaveReason({
      draft,
      changed,
      isNew: flags.isNew,
    }),
    touch: () => {
      setTouched(true);
    },
    submit: () => {
      setTouched(true);
      save.mutate();
    },
  };
}

export type RoleEditorModel = ReturnType<typeof useRoleEditor>;
