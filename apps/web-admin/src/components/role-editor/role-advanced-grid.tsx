import { useState, type ReactNode } from 'react';
import { CheckCheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import {
  ACTION_WORDS,
  ALL_PERMISSIONS,
  PERM_HELP,
  PILLARS,
  RESOURCES,
  RESOURCE_PILLARS,
  SENSITIVE,
  holds,
  resourceLabel,
  splitPermission,
  statements,
  toPermissionMap,
  toPermissions,
  type Permission,
  type PermissionMap,
  FIRST_PILLAR,
  type Pillar,
  type Resource,
} from '@eduvault/policy';
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  NavIcon,
  cn,
} from '@eduvault/ui';
import { WithTooltip } from '../member-roles';
import { ImportantDot } from './role-areas';

const UNHELD = 'You don’t hold this, so you can’t put it in a role.';
const SENSITIVE_TIP = 'Sensitive: approvals, money or access.';

interface GridProps {
  permissions: PermissionMap;
  editorMap: PermissionMap;
  readOnly: boolean;
  onChange: (next: PermissionMap) => void;
}

const permissionsOf = (resource: Resource): Permission[] =>
  statements[resource].map((action) => `${resource}:${action}` as Permission);

const resourcesIn = (pillar: Pillar): Resource[] =>
  RESOURCES.filter((resource) => RESOURCE_PILLARS[resource] === pillar);

const inPillar = (pillar: Pillar): Permission[] =>
  resourcesIn(pillar).flatMap((resource) => permissionsOf(resource));

function matches(permission: Permission, filter: string): boolean {
  if (filter === '') {
    return true;
  }
  const [resource, action] = splitPermission(permission);
  return [
    resourceLabel(resource),
    resource,
    action,
    ACTION_WORDS[action],
    RESOURCE_PILLARS[resource],
  ]
    .join(' ')
    .toLowerCase()
    .includes(filter);
}

function chipTip(permission: Permission, held: boolean): string | undefined {
  const lines = [
    PERM_HELP[permission],
    SENSITIVE.includes(permission) ? SENSITIVE_TIP : undefined,
    held ? undefined : UNHELD,
  ].filter((line): line is string => line !== undefined);
  return lines.length === 0 ? undefined : lines.join(' ');
}

function change(
  current: PermissionMap,
  edit: { add?: readonly Permission[]; remove?: readonly Permission[] }
): PermissionMap {
  const removed = new Set(edit.remove);
  return toPermissionMap([
    ...toPermissions(current).filter((permission) => !removed.has(permission)),
    ...(edit.add ?? []),
  ]);
}

interface ChipProps {
  permission: Permission;
  on: boolean;
  held: boolean;
  readOnly: boolean;
  onToggle: () => void;
}

function Chip({ permission, on, held, readOnly, onToggle }: ChipProps) {
  const [resource, action] = splitPermission(permission);
  return (
    <WithTooltip text={chipTip(permission, held)}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${resourceLabel(resource)}: ${ACTION_WORDS[action]}`}
        disabled={readOnly || !held}
        onClick={onToggle}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          on
            ? 'border-primary bg-primary text-primary-foreground'
            : 'bg-background hover:bg-muted',
          !held && 'line-through'
        )}
      >
        {ACTION_WORDS[action]}
        {SENSITIVE.includes(permission) ? <ImportantDot /> : null}
      </button>
    </WithTooltip>
  );
}

function ResourceRow({
  resource,
  shown,
  grid,
}: {
  resource: Resource;
  shown: readonly Permission[];
  grid: GridProps;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <span className="text-sm">{resourceLabel(resource)}</span>
      <span className="flex flex-wrap gap-1.5">
        {permissionsOf(resource)
          .filter((permission) => shown.includes(permission))
          .map((permission) => {
            const on = holds(grid.permissions, permission);
            return (
              <Chip
                key={permission}
                permission={permission}
                on={on}
                held={holds(grid.editorMap, permission)}
                readOnly={grid.readOnly}
                onToggle={() => {
                  grid.onChange(
                    change(
                      grid.permissions,
                      on ? { remove: [permission] } : { add: [permission] }
                    )
                  );
                }}
              />
            );
          })}
      </span>
    </li>
  );
}

function PillarActions({ pillar, grid }: { pillar: Pillar; grid: GridProps }) {
  const all = inPillar(pillar);
  return (
    <span className="flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => {
          grid.onChange(
            change(grid.permissions, {
              add: all.filter((permission) =>
                holds(grid.editorMap, permission)
              ),
            })
          );
        }}
      >
        <CheckCheckIcon />
        Select all I hold
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => {
          grid.onChange(change(grid.permissions, { remove: all }));
        }}
      >
        <XIcon />
        Clear
      </Button>
    </span>
  );
}

function PillarHeader({
  pillar,
  open,
  grid,
}: {
  pillar: Pillar;
  open: boolean;
  grid: GridProps;
}) {
  const all = inPillar(pillar);
  const on = all.filter((permission) => holds(grid.permissions, permission));
  const important = on.filter((permission) => SENSITIVE.includes(permission));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <ChevronDownIcon
            className={cn('size-4 transition-transform', !open && '-rotate-90')}
          />
          {pillar}
          <Badge variant="outline">
            {on.length}/{all.length}
          </Badge>
          {important.length > 0 ? (
            <WithTooltip text="Sensitive permissions ticked in this pillar">
              <Badge variant="warning">{important.length} important</Badge>
            </WithTooltip>
          ) : null}
        </button>
      </CollapsibleTrigger>
      {open && !grid.readOnly ? (
        <PillarActions pillar={pillar} grid={grid} />
      ) : null}
    </div>
  );
}

interface PillarProps {
  pillar: Pillar;
  filter: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grid: GridProps;
}

function PillarSection({
  pillar,
  filter,
  open,
  onOpenChange,
  grid,
}: PillarProps) {
  const shown = inPillar(pillar).filter((permission) =>
    matches(permission, filter)
  );
  if (shown.length === 0) {
    return null;
  }
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <PillarHeader pillar={pillar} open={open} grid={grid} />
      <CollapsibleContent>
        <ul className="mt-2 flex flex-col divide-y rounded-md border">
          {resourcesIn(pillar)
            .filter((resource) =>
              permissionsOf(resource).some((permission) =>
                shown.includes(permission)
              )
            )
            .map((resource) => (
              <ResourceRow
                key={resource}
                resource={resource}
                shown={shown}
                grid={grid}
              />
            ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

const firstTicked = (permissions: PermissionMap): Pillar =>
  PILLARS.find((pillar) =>
    inPillar(pillar).some((permission) => holds(permissions, permission))
  ) ?? FIRST_PILLAR;

function NoMatch() {
  return (
    <div className="py-4 text-center">
      <p className="font-medium">No permissions match</p>
      <p className="text-sm text-muted-foreground">
        Try “approve”, “publish” or a pillar name.
      </p>
    </div>
  );
}

function GridPanel({
  grid,
  children,
}: {
  grid: GridProps;
  children: ReactNode;
}) {
  const held = ALL_PERMISSIONS.filter((permission) =>
    holds(grid.permissions, permission)
  );
  return (
    <>
      <div className="flex items-center gap-2">
        <h4 className="font-medium">Every permission, one by one</h4>
        <Badge variant="outline">
          {held.length}/{ALL_PERMISSIONS.length}
        </Badge>
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <ImportantDot /> important
        {grid.readOnly ? '' : ' · struck through: you don’t hold it'}
      </p>
      {children}
    </>
  );
}

export function RoleAdvancedGrid(grid: GridProps) {
  const [filter, setFilter] = useState('');
  const [opened, setOpened] = useState<ReadonlySet<Pillar>>(
    () => new Set([firstTicked(grid.permissions)])
  );
  const needle = filter.trim().toLowerCase();
  const toggle = (pillar: Pillar, next: boolean) => {
    const updated = new Set(opened);
    if (next) {
      updated.add(pillar);
    } else {
      updated.delete(pillar);
    }
    setOpened(updated);
  };
  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium"
        >
          <NavIcon name="sliders-horizontal" className="size-4" />
          Advanced: every permission, one by one
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 border-t p-3">
        <GridPanel grid={grid}>
          <Input
            aria-label="Filter permissions"
            placeholder="Filter permissions"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
          {ALL_PERMISSIONS.some((permission) => matches(permission, needle)) ? (
            PILLARS.map((pillar) => (
              <PillarSection
                key={pillar}
                pillar={pillar}
                filter={needle}
                open={needle !== '' || opened.has(pillar)}
                onOpenChange={(next) => {
                  toggle(pillar, next);
                }}
                grid={grid}
              />
            ))
          ) : (
            <NoMatch />
          )}
        </GridPanel>
      </CollapsibleContent>
    </Collapsible>
  );
}
