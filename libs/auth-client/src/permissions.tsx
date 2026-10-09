import { createContext, useContext, type ReactNode } from 'react';
import type { MePermissions } from '@eduvault/api-contract';
import {
  canAny,
  type ActionOf,
  type Gate,
  type Permission,
  type Resource,
} from '@eduvault/policy';

const PermissionsContext = createContext<MePermissions | null>(null);

export const PermissionsProvider = ({
  value,
  children,
}: {
  value: MePermissions;
  children: ReactNode;
}) => (
  <PermissionsContext.Provider value={value}>
    {children}
  </PermissionsContext.Provider>
);

/** Null outside a provider, for shells that have no permissions to show. */
export const useOptionalPermissions = (): MePermissions | null =>
  useContext(PermissionsContext);

export function usePermissions(): MePermissions {
  const value = useOptionalPermissions();
  if (value === null) {
    throw new Error('usePermissions needs a PermissionsProvider');
  }
  return value;
}

export function useCan<R extends Resource>(
  resource: R,
  action: ActionOf<R>
): boolean {
  return useCanAny([`${resource}:${action}` as Permission]);
}

/** True when the member holds any one permission of the gate. */
export function useCanAny(gate: Gate): boolean {
  return canAny(usePermissions().permissions, gate);
}

type CanProps = { children: ReactNode } & (
  | { permission: Permission; anyOf?: never }
  | { anyOf: Gate; permission?: never }
);

/** Renders its children only when the permission, or one of the gate, is held. */
export function Can({ permission, anyOf, children }: CanProps) {
  const allowed = useCanAny(anyOf ?? [permission]);
  return allowed ? children : null;
}
